CREATE TABLE incomes (
  id TEXT PRIMARY KEY,
  month TEXT NOT NULL CHECK (month GLOB '[0-9][0-9][0-9][0-9][0-9][0-9]'),
  label TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount > 0),
  person TEXT NOT NULL CHECK (person IN ('husband', 'wife')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE expenses (
  id TEXT PRIMARY KEY,
  month TEXT NOT NULL CHECK (month GLOB '[0-9][0-9][0-9][0-9][0-9][0-9]'),
  label TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount < 0),
  person TEXT NOT NULL CHECK (person IN ('husband', 'wife')),
  is_carryover INTEGER NOT NULL DEFAULT 0 CHECK (is_carryover IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE carryovers (
  id TEXT PRIMARY KEY,
  month TEXT NOT NULL CHECK (month GLOB '[0-9][0-9][0-9][0-9][0-9][0-9]'),
  label TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount < 0),
  person TEXT NOT NULL CHECK (person IN ('husband', 'wife')),
  is_cleared INTEGER NOT NULL DEFAULT 0 CHECK (is_cleared IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE sessions (
  token TEXT PRIMARY KEY CHECK (length(token) = 64),
  person TEXT CHECK (person IN ('husband', 'wife')),
  auth_method TEXT NOT NULL CHECK (auth_method IN ('password', 'passkey')),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE passkey_credentials (
  id TEXT PRIMARY KEY,
  person TEXT NOT NULL CHECK (person IN ('husband', 'wife')),
  public_key_base64 TEXT NOT NULL,
  counter INTEGER NOT NULL DEFAULT 0,
  device_name TEXT,
  transports TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);

CREATE TABLE webauthn_challenges (
  id TEXT PRIMARY KEY,
  challenge TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('registration', 'authentication')),
  person TEXT CHECK (person IN ('husband', 'wife')),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_incomes_month ON incomes(month);
CREATE INDEX idx_expenses_month ON expenses(month);
CREATE INDEX idx_expenses_month_carryover ON expenses(month, is_carryover);
CREATE INDEX idx_carryovers_month ON carryovers(month);
CREATE INDEX idx_carryovers_month_cleared ON carryovers(month, is_cleared);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);
CREATE INDEX idx_passkey_credentials_person ON passkey_credentials(person);
CREATE INDEX idx_webauthn_challenges_lookup ON webauthn_challenges(type, person, created_at);
CREATE INDEX idx_webauthn_challenges_expires_at ON webauthn_challenges(expires_at);
