import { BadRequestException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { JWTPayload } from 'jose';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CatalogClient } from '../catalog/catalog.client.js';
import { UsersClient } from '../users/users.client.js';
import { BookingsClient } from './bookings.client.js';
import { BookingsController, type BookingInput } from './bookings.controller.js';

describe('BookingsController', () => {
  const bookingsMock = { preview: vi.fn(), create: vi.fn(), listForCustomer: vi.fn(), findForCustomer: vi.fn() };
  const usersMock = { findByAuth0Id: vi.fn() };
  const catalogMock = { findService: vi.fn(), findArea: vi.fn() };
  const me = { sub: 'auth0|me' } as JWTPayload;
  let controller: BookingsController;

  const input = (overrides: Partial<BookingInput> = {}): BookingInput => ({
    serviceSlug: 'desentupimento-lavatorio-sanita',
    address: { street: 'Rua da Sofia 10', details: '2.º Esq.', postalCode: '3000389' },
    scheduledStart: '2026-11-18T15:00:00Z',
    notes: 'Tocar à campainha',
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    usersMock.findByAuth0Id.mockResolvedValue({ id: 'user-1' });
    catalogMock.findService.mockResolvedValue({
      id: 'svc-1',
      slug: 'desentupimento-lavatorio-sanita',
      name: 'Desentupimento de lavatório ou sanita',
      pricingModel: 'fixed',
      priceCents: 6500,
      vatRate: 0.23,
      durationMinutes: 60,
      description: 'not needed by the booking',
    });
    catalogMock.findArea.mockResolvedValue({
      postalCode: '3000-389',
      municipality: { code: '0603', name: 'Coimbra', district: 'Coimbra' },
      available: true,
    });
    controller = new BookingsController(
      bookingsMock as unknown as BookingsClient,
      usersMock as unknown as UsersClient,
      catalogMock as unknown as CatalogClient,
    );
  });

  it('builds the booking from the token, the catalog and the postal code', async () => {
    await controller.create(me, input());

    expect(usersMock.findByAuth0Id).toHaveBeenCalledWith('auth0|me');
    expect(bookingsMock.create).toHaveBeenCalledWith({
      customerId: 'user-1',
      service: {
        id: 'svc-1',
        slug: 'desentupimento-lavatorio-sanita',
        name: 'Desentupimento de lavatório ou sanita',
        durationMinutes: 60,
        priceCents: 6500,
        vatRate: 0.23,
      },
      address: { street: 'Rua da Sofia 10', details: '2.º Esq.', postalCode: '3000-389', city: 'Coimbra' },
      municipalityCode: '0603',
      scheduledStart: '2026-11-18T15:00:00Z',
      notes: 'Tocar à campainha',
    });
  });

  it('ignores a price, a customer or a status sent by the app', async () => {
    const sneaky = { ...input(), priceCents: 1, customerId: 'someone-else', status: 'confirmed' } as BookingInput;

    await controller.create(me, sneaky);

    const sent = bookingsMock.create.mock.calls[0][0];
    expect(sent.service.priceCents).toBe(6500);
    expect(sent.customerId).toBe('user-1');
    expect(sent).not.toHaveProperty('status');
    expect(sent).not.toHaveProperty('priceCents');
  });

  it('preview uses the same checks but does not create anything', async () => {
    await controller.preview(me, input());

    expect(bookingsMock.preview).toHaveBeenCalledTimes(1);
    expect(bookingsMock.create).not.toHaveBeenCalled();
  });

  it('refuses a postal code outside the area we work in', async () => {
    catalogMock.findArea.mockResolvedValue({ postalCode: '1000-001', municipality: null, available: false });

    await expect(controller.create(me, input())).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(bookingsMock.create).not.toHaveBeenCalled();
  });

  it('needs the full postal code to book (4 digits only search)', async () => {
    catalogMock.findArea.mockResolvedValue({
      postalCode: '3000',
      municipality: { code: '0603', name: 'Coimbra', district: 'Coimbra' },
      available: true,
    });

    await expect(controller.create(me, input())).rejects.toThrow('must be complete');
  });

  it('refuses a service that is not fixed-price', async () => {
    catalogMock.findService.mockResolvedValue({ id: 'svc-2', pricingModel: 'quote' });

    await expect(controller.create(me, input())).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('passes on "no profile yet" and "no such service"', async () => {
    usersMock.findByAuth0Id.mockRejectedValue(new NotFoundException('No user linked to auth0|me'));
    await expect(controller.create(me, input())).rejects.toBeInstanceOf(NotFoundException);

    usersMock.findByAuth0Id.mockResolvedValue({ id: 'user-1' });
    catalogMock.findService.mockRejectedValue(new NotFoundException('Service nope not found'));
    await expect(controller.create(me, input({ serviceSlug: 'nope' }))).rejects.toThrow('Service nope not found');
  });

  it('asks for the three things a booking cannot do without', async () => {
    await expect(controller.create(me, input({ serviceSlug: undefined }))).rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.create(me, input({ address: { street: 'Rua X' } }))).rejects.toThrow('postalCode');
    await expect(controller.create(me, input({ scheduledStart: undefined }))).rejects.toThrow('scheduledStart');
    await expect(controller.create(me, {} as BookingInput)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('lists and reads bookings as the logged-in customer only', async () => {
    await controller.list(me);
    await controller.find(me, 'booking-9');

    expect(bookingsMock.listForCustomer).toHaveBeenCalledWith('user-1');
    expect(bookingsMock.findForCustomer).toHaveBeenCalledWith('booking-9', 'user-1');
  });
});
