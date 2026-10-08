import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';

export interface PasswordHasher {
  hash: (password: string) => Promise<string>;
  /** Constant-work verification: an unknown account still costs one bcrypt comparison. */
  verify: (password: string, hash: string | null) => Promise<boolean>;
}

export function createPasswordHasher(rounds: number): PasswordHasher {
  // A real hash at the configured cost, created once. Comparing against it when the
  // email is unknown keeps failed logins equally slow, so timing does not reveal accounts.
  let dummyHash: Promise<string> | null = null;
  const getDummyHash = () => (dummyHash ??= bcrypt.hash(randomBytes(16).toString('hex'), rounds));

  return {
    hash: (password) => bcrypt.hash(password, rounds),
    async verify(password, hash) {
      if (!hash) {
        await bcrypt.compare(password, await getDummyHash());
        return false;
      }
      return bcrypt.compare(password, hash);
    },
  };
}
