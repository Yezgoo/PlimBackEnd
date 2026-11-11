import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'requiredPermissions';

// The permission every admin has. Created on the Plim API in Auth0 and given to people through the "admin" role.
export const ADMIN_ACCESS = 'admin:access';

// Marks a route (or a whole controller) as needing these Auth0 permissions:
//   @RequirePermissions('admin:access')
export const RequirePermissions = (...permissions: string[]) => SetMetadata(PERMISSIONS_KEY, permissions);
