-- セッションテーブル（cookieにはtokenのみ保存、詳細はDBに）
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token VARCHAR(64) UNIQUE NOT NULL,
  person VARCHAR(10) CHECK (person IN ('husband', 'wife')),
  auth_method VARCHAR(10) NOT NULL DEFAULT 'password'
    CHECK (auth_method IN ('password', 'passkey')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sessions_token ON sessions(token);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);

-- パスキー資格情報テー���ル
CREATE TABLE passkey_credentials (
  id TEXT PRIMARY KEY,
  person VARCHAR(10) NOT NULL CHECK (person IN ('husband', 'wife')),
  public_key BYTEA NOT NULL,
  counter BIGINT NOT NULL DEFAULT 0,
  device_name VARCHAR(100),
  transports TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_passkey_credentials_person ON passkey_credentials(person);

-- WebAuthn チャレンジ一時保存（5分で期限切れ）
CREATE TABLE webauthn_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge TEXT NOT NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('registration', 'authentication')),
  person VARCHAR(10),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_webauthn_challenges_expires_at ON webauthn_challenges(expires_at);

-- RLS有効化（service_roleはバイパスするためポリシー不要）
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE passkey_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE webauthn_challenges ENABLE ROW LEVEL SECURITY;
