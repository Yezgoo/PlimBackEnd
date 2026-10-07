import { Test, TestingModule } from '@nestjs/testing';
import { ApiGatewayController } from './api-gateway.controller.js';
import { ApiGatewayService } from './api-gateway.service.js';
import { AuthGuard } from './auth/auth.guard.js';

describe('ApiGatewayController', () => {
  let apiGatewayController: ApiGatewayController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [ApiGatewayController],
      providers: [ApiGatewayService],
    }).overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true }) // fake guard: always lets requests through
      .compile();

    apiGatewayController = app.get<ApiGatewayController>(ApiGatewayController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(apiGatewayController.getHello()).toBe('Hello World!');
    });
  });
});
