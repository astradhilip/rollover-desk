/** Failures the application expects. The HTTP layer maps each to one status and error code. */
export class InvalidCredentialsError extends Error {
  constructor() {
    super('Email or password is incorrect.');
  }
}

export class NotFoundError extends Error {
  constructor(what: string) {
    super(`${what} not found.`);
  }
}

export class ConflictError extends Error {}
