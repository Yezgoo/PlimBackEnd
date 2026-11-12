import { NotFoundException } from '@nestjs/common';
import type { JWTPayload } from 'jose';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UsersClient } from '../users/users.client.js';
import { BookingsClient } from './bookings.client.js';
import { MeOffersController } from './me-offers.controller.js';

describe('MeOffersController', () => {
  const bookingsMock = { listOffers: vi.fn(), acceptOffer: vi.fn(), declineOffer: vi.fn() };
  const usersMock = { findProfessional: vi.fn() };
  const me = { sub: 'auth0|me' } as JWTPayload;
  let controller: MeOffersController;

  beforeEach(() => {
    vi.clearAllMocks();
    usersMock.findProfessional.mockResolvedValue({ id: 'pro-1' });
    controller = new MeOffersController(bookingsMock as unknown as BookingsClient, usersMock as unknown as UsersClient);
  });

  it('always acts as the caller\'s own professional profile', async () => {
    await controller.list(me, 'pending');
    await controller.accept(me, 'offer-1');
    await controller.decline(me, 'offer-2');

    expect(usersMock.findProfessional).toHaveBeenCalledWith('auth0|me');
    expect(bookingsMock.listOffers).toHaveBeenCalledWith('pro-1', 'pending');
    expect(bookingsMock.acceptOffer).toHaveBeenCalledWith('offer-1', 'pro-1');
    expect(bookingsMock.declineOffer).toHaveBeenCalledWith('offer-2', 'pro-1');
  });

  it('answers 404 to someone who is not a professional, without asking booking-service', async () => {
    usersMock.findProfessional.mockRejectedValue(new NotFoundException('auth0|me has not applied as a professional'));

    await expect(controller.list(me)).rejects.toBeInstanceOf(NotFoundException);
    expect(bookingsMock.listOffers).not.toHaveBeenCalled();
  });
});
