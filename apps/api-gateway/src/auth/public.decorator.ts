import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

// Marks a route (or a whole controller) as not requiring a token
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
