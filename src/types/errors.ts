export class WordPressConnectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WordPressConnectionError';
  }
}

export class AIGenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AIGenerationError';
  }
}

export class FirebaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FirebaseError';
  }
}

export class RateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RateLimitError';
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}
