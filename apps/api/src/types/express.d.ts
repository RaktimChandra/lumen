import 'express-serve-static-core';

declare module 'express-serve-static-core' {
  interface Request {
    /** Set by the authenticate middleware on protected routes. */
    auth?: { userId: string; sessionId: string };
  }
}
