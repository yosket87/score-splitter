-- 0013の全既存値を保持し、Firebase主体・承認・失効条件を追加する。

CREATE TABLE _firebase_migration_assert(ok INTEGER NOT NULL CHECK(ok=1));

CREATE TABLE _firebase_expected_schema(type TEXT,name TEXT,tbl_name TEXT,sql TEXT);

INSERT INTO _firebase_expected_schema VALUES('index','idx_carryovers_household_month','carryovers','CREATE INDEX idx_carryovers_household_month ON carryovers(household_id,month)');

INSERT INTO _firebase_expected_schema VALUES('index','idx_carryovers_month','carryovers','CREATE INDEX idx_carryovers_month ON carryovers(month)');

INSERT INTO _firebase_expected_schema VALUES('index','idx_carryovers_month_cleared','carryovers','CREATE INDEX idx_carryovers_month_cleared ON carryovers(month, is_cleared)');

INSERT INTO _firebase_expected_schema VALUES('index','idx_carryovers_unique_household_month_label_amount_person','carryovers','CREATE UNIQUE INDEX idx_carryovers_unique_household_month_label_amount_person ON carryovers(household_id,month,label,amount,person)');

INSERT INTO _firebase_expected_schema VALUES('index','idx_expenses_household_month','expenses','CREATE INDEX idx_expenses_household_month ON expenses(household_id,month)');

INSERT INTO _firebase_expected_schema VALUES('index','idx_expenses_month','expenses','CREATE INDEX idx_expenses_month ON expenses(month)');

INSERT INTO _firebase_expected_schema VALUES('index','idx_expenses_month_carryover','expenses','CREATE INDEX idx_expenses_month_carryover ON expenses(month, is_carryover)');

INSERT INTO _firebase_expected_schema VALUES('index','idx_google_identities_active_user','google_identities','CREATE UNIQUE INDEX idx_google_identities_active_user ON google_identities(user_id) WHERE revoked_at IS NULL');

INSERT INTO _firebase_expected_schema VALUES('index','idx_incomes_household_month','incomes','CREATE INDEX idx_incomes_household_month ON incomes(household_id,month)');

INSERT INTO _firebase_expected_schema VALUES('index','idx_incomes_month','incomes','CREATE INDEX idx_incomes_month ON incomes(month)');

INSERT INTO _firebase_expected_schema VALUES('index','idx_login_attempts_updated_at','login_attempts','CREATE INDEX idx_login_attempts_updated_at ON login_attempts(updated_at)');

INSERT INTO _firebase_expected_schema VALUES('index','idx_memberships_active_user_household','household_memberships','CREATE UNIQUE INDEX idx_memberships_active_user_household ON household_memberships(user_id,household_id) WHERE revoked_at IS NULL');

INSERT INTO _firebase_expected_schema VALUES('index','idx_migration_active_subject','google_migration_requests','CREATE UNIQUE INDEX idx_migration_active_subject ON google_migration_requests(issuer,subject) WHERE status IN (''approved'',''consuming'')');

INSERT INTO _firebase_expected_schema VALUES('index','idx_migration_legacy_slots','google_migration_requests','CREATE UNIQUE INDEX idx_migration_legacy_slots ON google_migration_requests(approved_household_id,legacy_slot) WHERE purpose=''legacy_enrollment'' AND status IN (''approved'',''consuming'',''consumed'')');

INSERT INTO _firebase_expected_schema VALUES('index','idx_migration_requests_expires','google_migration_requests','CREATE INDEX idx_migration_requests_expires ON google_migration_requests(expires_at)');

INSERT INTO _firebase_expected_schema VALUES('index','idx_oauth_attempts_expires','oauth_login_attempts','CREATE INDEX idx_oauth_attempts_expires ON oauth_login_attempts(expires_at)');

INSERT INTO _firebase_expected_schema VALUES('index','idx_passkey_credentials_person','passkey_credentials','CREATE INDEX idx_passkey_credentials_person ON passkey_credentials(person)');

INSERT INTO _firebase_expected_schema VALUES('index','idx_payment_operations_household_month','payment_operations','CREATE INDEX idx_payment_operations_household_month ON payment_operations(household_id,month)');

INSERT INTO _firebase_expected_schema VALUES('index','idx_payment_records_household_month','payment_records','CREATE INDEX idx_payment_records_household_month ON payment_records(household_id,month)');

INSERT INTO _firebase_expected_schema VALUES('index','idx_sessions_expires_at','sessions','CREATE INDEX idx_sessions_expires_at ON sessions(expires_at)');

INSERT INTO _firebase_expected_schema VALUES('index','idx_sessions_oauth_attempt','sessions','CREATE UNIQUE INDEX idx_sessions_oauth_attempt ON sessions(oauth_attempt_sequence) WHERE auth_method=''google''');

INSERT INTO _firebase_expected_schema VALUES('index','idx_sessions_user','sessions','CREATE INDEX idx_sessions_user ON sessions(user_id)');

INSERT INTO _firebase_expected_schema VALUES('index','idx_webauthn_challenges_expires_at','webauthn_challenges','CREATE INDEX idx_webauthn_challenges_expires_at ON webauthn_challenges(expires_at)');

INSERT INTO _firebase_expected_schema VALUES('index','idx_webauthn_challenges_lookup','webauthn_challenges','CREATE INDEX idx_webauthn_challenges_lookup ON webauthn_challenges(type, person, created_at)');

INSERT INTO _firebase_expected_schema VALUES('table','ai_diagnoses','ai_diagnoses','CREATE TABLE "ai_diagnoses" (
  id TEXT PRIMARY KEY,
  month TEXT NOT NULL CHECK (length(month) = 6),
  result_json TEXT NULL,
  input_hash TEXT NULL,
  analysis_version TEXT NULL,
  run_token TEXT NULL,
  run_expires_at TEXT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
, household_id TEXT NOT NULL REFERENCES households(id),
 UNIQUE(household_id,month)
)');

INSERT INTO _firebase_expected_schema VALUES('table','ai_diagnosis_source_revision','ai_diagnosis_source_revision','CREATE TABLE "ai_diagnosis_source_revision" (
  id INTEGER NOT NULL CHECK (id = 1),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  updated_at TEXT NOT NULL
, household_id TEXT NOT NULL REFERENCES households(id),
 PRIMARY KEY(household_id)
)');

INSERT INTO _firebase_expected_schema VALUES('table','ai_execution_guard','ai_execution_guard','CREATE TABLE "ai_execution_guard" (
  id INTEGER NOT NULL CHECK (id = 1),
  run_token TEXT NULL,
  run_expires_at TEXT NULL,
  last_started_at TEXT NULL,
  usage_date TEXT NOT NULL,
  daily_count INTEGER NOT NULL DEFAULT 0 CHECK (daily_count >= 0),
  updated_at TEXT NOT NULL
, household_id TEXT NOT NULL REFERENCES households(id),
 PRIMARY KEY(household_id)
)');

INSERT INTO _firebase_expected_schema VALUES('table','carryovers','carryovers','CREATE TABLE "carryovers" (
  id TEXT PRIMARY KEY,
  month TEXT NOT NULL CHECK (month GLOB ''[0-9][0-9][0-9][0-9][0-9][0-9]''),
  label TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount < 0),
  person TEXT NOT NULL CHECK (person IN (''husband'', ''wife'')),
  is_cleared INTEGER NOT NULL DEFAULT 0 CHECK (is_cleared IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
, household_id TEXT NOT NULL REFERENCES households(id))');

INSERT INTO _firebase_expected_schema VALUES('table','expenses','expenses','CREATE TABLE "expenses" (
  id TEXT PRIMARY KEY,
  month TEXT NOT NULL CHECK (month GLOB ''[0-9][0-9][0-9][0-9][0-9][0-9]''),
  label TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount < 0),
  person TEXT NOT NULL CHECK (person IN (''husband'', ''wife'')),
  is_carryover INTEGER NOT NULL DEFAULT 0 CHECK (is_carryover IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
, ai_category TEXT NULL
  CHECK (ai_category IS NULL OR ai_category IN (''groceries'',''dining'',''household'',''housing'',''utilities'',''communications'',''transportation'',''healthcare'',''clothing_beauty'',''entertainment'',''subscriptions'',''social_gifts'',''travel'',''other'')), ai_category_source TEXT NULL
  CHECK (ai_category_source IS NULL OR ai_category_source = ''ai''), ai_categorized_at TEXT NULL, household_id TEXT NOT NULL REFERENCES households(id))');

INSERT INTO _firebase_expected_schema VALUES('table','google_identities','google_identities','CREATE TABLE google_identities (
  id TEXT NOT NULL PRIMARY KEY CHECK(length(trim(id)) > 0),
  user_id TEXT NOT NULL REFERENCES users(id),
  issuer TEXT NOT NULL CHECK(issuer=''https://accounts.google.com''),
  subject TEXT NOT NULL CHECK(length(trim(subject)) > 0),
  email TEXT,
  created_at TEXT NOT NULL CHECK(julianday(created_at) IS NOT NULL),
  revoked_at TEXT CHECK(revoked_at IS NULL OR julianday(revoked_at) IS NOT NULL),
  UNIQUE(issuer,subject)
)');

INSERT INTO _firebase_expected_schema VALUES('table','google_migration_requests','google_migration_requests','CREATE TABLE google_migration_requests (
  id TEXT NOT NULL PRIMARY KEY CHECK(length(trim(id)) > 0),
  purpose TEXT NOT NULL CHECK(purpose IN (''legacy_enrollment'',''identity_recovery'')),
  issuer TEXT NOT NULL CHECK(issuer=''https://accounts.google.com''),
  subject TEXT NOT NULL CHECK(length(trim(subject)) > 0),
  email TEXT,
  code_hash TEXT NOT NULL UNIQUE CHECK(length(code_hash)=64 AND code_hash NOT GLOB ''*[^0-9a-f]*''),
  browser_binding_hash TEXT NOT NULL CHECK(length(browser_binding_hash)=64 AND browser_binding_hash NOT GLOB ''*[^0-9a-f]*''),
  status TEXT NOT NULL DEFAULT ''pending'' CHECK(status IN (''pending'',''approved'',''consuming'',''consumed'',''canceled'',''expired'')),
  created_at TEXT NOT NULL CHECK(julianday(created_at) IS NOT NULL),
  expires_at TEXT NOT NULL CHECK(julianday(expires_at) IS NOT NULL AND julianday(expires_at) > julianday(created_at)),
  approved_at TEXT CHECK(approved_at IS NULL OR julianday(approved_at) IS NOT NULL),
  approval_expires_at TEXT CHECK(approval_expires_at IS NULL OR julianday(approval_expires_at) IS NOT NULL),
  approved_by TEXT,
  confirmation_ref TEXT,
  approved_household_id TEXT REFERENCES households(id),
  approved_default_person TEXT CHECK(approved_default_person IS NULL OR approved_default_person IN (''husband'',''wife'')),
  legacy_slot TEXT CHECK(legacy_slot IS NULL OR legacy_slot IN (''existing-member-1'',''existing-member-2'')),
  target_user_id TEXT REFERENCES users(id),
  expected_old_identity_id TEXT REFERENCES google_identities(id),
  expected_session_epoch INTEGER CHECK(expected_session_epoch IS NULL OR (typeof(expected_session_epoch)=''integer'' AND expected_session_epoch BETWEEN 0 AND 9007199254740990)),
  consumption_id TEXT UNIQUE,
  consumed_at TEXT CHECK(consumed_at IS NULL OR julianday(consumed_at) IS NOT NULL),
  consumed_user_id TEXT REFERENCES users(id),
  CHECK((approved_at IS NULL AND approval_expires_at IS NULL AND approved_by IS NULL AND confirmation_ref IS NULL AND approved_household_id IS NULL AND approved_default_person IS NULL AND legacy_slot IS NULL AND target_user_id IS NULL AND expected_old_identity_id IS NULL AND expected_session_epoch IS NULL) OR
    (approved_at IS NOT NULL AND approval_expires_at IS NOT NULL AND julianday(approval_expires_at) > julianday(approved_at) AND julianday(approval_expires_at) <= julianday(expires_at) AND approved_by IS NOT NULL AND length(trim(approved_by)) > 0 AND confirmation_ref IS NOT NULL AND length(trim(confirmation_ref)) > 0 AND
      ((purpose=''legacy_enrollment'' AND approved_household_id IS NOT NULL AND approved_default_person IS NOT NULL AND legacy_slot IS NOT NULL AND target_user_id IS NULL AND expected_old_identity_id IS NULL AND expected_session_epoch IS NULL) OR
       (purpose=''identity_recovery'' AND target_user_id IS NOT NULL AND expected_old_identity_id IS NOT NULL AND expected_session_epoch IS NOT NULL AND approved_household_id IS NULL AND approved_default_person IS NULL AND legacy_slot IS NULL)))),
  CHECK((status=''pending'' AND approved_at IS NULL AND consumption_id IS NULL AND consumed_at IS NULL AND consumed_user_id IS NULL) OR
    (status=''approved'' AND approved_at IS NOT NULL AND consumption_id IS NULL AND consumed_at IS NULL AND consumed_user_id IS NULL) OR
    (status=''consuming'' AND approved_at IS NOT NULL AND consumption_id IS NOT NULL AND consumed_at IS NULL AND consumed_user_id IS NULL) OR
    (status=''consumed'' AND approved_at IS NOT NULL AND consumption_id IS NOT NULL AND consumed_at IS NOT NULL AND consumed_user_id IS NOT NULL) OR
    (status IN (''canceled'',''expired'') AND consumption_id IS NULL AND consumed_at IS NULL AND consumed_user_id IS NULL))
)');

INSERT INTO _firebase_expected_schema VALUES('table','household_memberships','household_memberships','CREATE TABLE household_memberships (
  id TEXT NOT NULL PRIMARY KEY CHECK(length(trim(id)) > 0),
  user_id TEXT NOT NULL REFERENCES users(id),
  household_id TEXT NOT NULL REFERENCES households(id),
  default_person TEXT NOT NULL CHECK(default_person IN (''husband'',''wife'')),
  created_at TEXT NOT NULL CHECK(julianday(created_at) IS NOT NULL),
  revoked_at TEXT CHECK(revoked_at IS NULL OR julianday(revoked_at) IS NOT NULL),
  UNIQUE(id,user_id,household_id)
)');

INSERT INTO _firebase_expected_schema VALUES('table','households','households','CREATE TABLE households (
  id TEXT NOT NULL PRIMARY KEY,
  legacy_auth_key TEXT UNIQUE,
  created_at TEXT NOT NULL
, legacy_auth_disabled_at TEXT CHECK(legacy_auth_disabled_at IS NULL OR julianday(legacy_auth_disabled_at) IS NOT NULL))');

INSERT INTO _firebase_expected_schema VALUES('table','incomes','incomes','CREATE TABLE "incomes" (
  id TEXT PRIMARY KEY,
  month TEXT NOT NULL CHECK (month GLOB ''[0-9][0-9][0-9][0-9][0-9][0-9]''),
  label TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount > 0),
  person TEXT NOT NULL CHECK (person IN (''husband'', ''wife'')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
, household_id TEXT NOT NULL REFERENCES households(id))');

INSERT INTO _firebase_expected_schema VALUES('table','login_attempts','login_attempts','CREATE TABLE login_attempts (
  attempt_key TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0 CHECK (count >= 0),
  window_start TEXT NOT NULL,
  updated_at TEXT NOT NULL
)');

INSERT INTO _firebase_expected_schema VALUES('table','month_payment_revisions','month_payment_revisions','CREATE TABLE "month_payment_revisions" (
 month TEXT NOT NULL, revision INTEGER NOT NULL CHECK(typeof(revision) = ''integer'' AND revision BETWEEN 0 AND 9007199254740991)
, household_id TEXT NOT NULL REFERENCES households(id),
 PRIMARY KEY(household_id,month)
)');

INSERT INTO _firebase_expected_schema VALUES('table','oauth_login_attempts','oauth_login_attempts','CREATE TABLE oauth_login_attempts (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT CHECK(sequence BETWEEN 1 AND 9007199254740991),
  id TEXT NOT NULL UNIQUE CHECK(length(trim(id)) > 0),
  browser_binding_hash TEXT NOT NULL CHECK(length(browser_binding_hash)=64 AND browser_binding_hash NOT GLOB ''*[^0-9a-f]*''),
  state_hash TEXT NOT NULL UNIQUE CHECK(length(state_hash)=64 AND state_hash NOT GLOB ''*[^0-9a-f]*''),
  nonce TEXT,
  code_verifier TEXT,
  status TEXT NOT NULL DEFAULT ''pending'' CHECK(status IN (''pending'',''processing'',''completed'',''failed'',''expired'')),
  claim_id TEXT UNIQUE,
  verified_issuer TEXT CHECK(verified_issuer IS NULL OR verified_issuer=''https://accounts.google.com''),
  verified_subject TEXT CHECK(verified_subject IS NULL OR length(trim(verified_subject)) > 0),
  created_at TEXT NOT NULL CHECK(julianday(created_at) IS NOT NULL),
  expires_at TEXT NOT NULL CHECK(julianday(expires_at) IS NOT NULL AND julianday(expires_at) > julianday(created_at)),
  claimed_at TEXT CHECK(claimed_at IS NULL OR julianday(claimed_at) IS NOT NULL),
  completed_at TEXT CHECK(completed_at IS NULL OR julianday(completed_at) IS NOT NULL),
  CHECK((claim_id IS NULL AND claimed_at IS NULL) OR (claim_id IS NOT NULL AND length(trim(claim_id)) > 0 AND claimed_at IS NOT NULL)),
  CHECK(
    (status=''pending'' AND claim_id IS NULL AND nonce IS NOT NULL AND code_verifier IS NOT NULL AND completed_at IS NULL AND verified_issuer IS NULL AND verified_subject IS NULL) OR
    (status=''processing'' AND claim_id IS NOT NULL AND nonce IS NOT NULL AND code_verifier IS NOT NULL AND completed_at IS NULL AND verified_issuer IS NULL AND verified_subject IS NULL) OR
    (status=''completed'' AND claim_id IS NOT NULL AND nonce IS NULL AND code_verifier IS NULL AND completed_at IS NOT NULL AND verified_issuer IS NOT NULL AND verified_subject IS NOT NULL) OR
    (status IN (''failed'',''expired'') AND nonce IS NULL AND code_verifier IS NULL AND completed_at IS NOT NULL AND verified_issuer IS NULL AND verified_subject IS NULL)
  )
)');

INSERT INTO _firebase_expected_schema VALUES('table','passkey_credentials','passkey_credentials','CREATE TABLE "passkey_credentials" (
  id TEXT PRIMARY KEY,
  person TEXT NOT NULL CHECK (person IN (''husband'', ''wife'')),
  public_key_base64 TEXT NOT NULL,
  counter INTEGER NOT NULL DEFAULT 0,
  device_name TEXT,
  transports TEXT NOT NULL DEFAULT ''[]'',
  created_at TEXT NOT NULL
, household_id TEXT NOT NULL REFERENCES households(id))');

INSERT INTO _firebase_expected_schema VALUES('table','payment_operations','payment_operations','CREATE TABLE "payment_operations" (
 id TEXT NOT NULL, month TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN (''record'',''correct'',''void'')),
 expected_revision INTEGER NOT NULL CHECK(typeof(expected_revision) = ''integer'' AND expected_revision BETWEEN 0 AND 9007199254740990),
 input_json TEXT NOT NULL CHECK(json_valid(input_json)), result_json TEXT NOT NULL CHECK(json_valid(result_json)),
 actor_person TEXT CHECK(actor_person IN (''husband'',''wife'')), actor_auth_method TEXT NOT NULL CHECK(actor_auth_method IN (''password'',''passkey'',''google'')), created_at TEXT NOT NULL
, household_id TEXT NOT NULL REFERENCES households(id),
 actor_user_id TEXT REFERENCES users(id),
 PRIMARY KEY(household_id,id),
 CHECK((actor_auth_method=''google'' AND actor_user_id IS NOT NULL) OR (actor_auth_method IN (''password'',''passkey'') AND actor_user_id IS NULL)))');

INSERT INTO _firebase_expected_schema VALUES('table','payment_records','payment_records','CREATE TABLE "payment_records" (
 id TEXT PRIMARY KEY, operation_id TEXT NOT NULL, month TEXT NOT NULL,
 signed_yen INTEGER NOT NULL CHECK(typeof(signed_yen) = ''integer'' AND signed_yen != 0 AND signed_yen BETWEEN -9007199254740991 AND 9007199254740991),
 paid_on TEXT NOT NULL CHECK(length(paid_on) = 10 AND date(paid_on, ''+0 days'') IS paid_on), created_at TEXT NOT NULL,
 snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json)), calculation_version TEXT NOT NULL, rounding_version TEXT NOT NULL
, household_id TEXT NOT NULL REFERENCES households(id),
 UNIQUE(household_id,id), UNIQUE(household_id,operation_id), FOREIGN KEY(household_id,operation_id) REFERENCES "payment_operations"(household_id,id)
)');

INSERT INTO _firebase_expected_schema VALUES('table','payment_voids','payment_voids','CREATE TABLE "payment_voids" (
 id TEXT PRIMARY KEY, operation_id TEXT NOT NULL, payment_id TEXT NOT NULL,
 reason TEXT NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 500), created_at TEXT NOT NULL
, household_id TEXT NOT NULL REFERENCES households(id),
 UNIQUE(household_id,operation_id), UNIQUE(household_id,payment_id), FOREIGN KEY(household_id,operation_id) REFERENCES "payment_operations"(household_id,id), FOREIGN KEY(household_id,payment_id) REFERENCES "payment_records"(household_id,id)
)');

INSERT INTO _firebase_expected_schema VALUES('table','sessions','sessions','CREATE TABLE "sessions" (
  token TEXT PRIMARY KEY CHECK (length(token) = 64),
  person TEXT CHECK (person IN (''husband'', ''wife'')),
  auth_method TEXT NOT NULL CHECK (auth_method IN (''password'', ''passkey'', ''google'')),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
, household_id TEXT NOT NULL REFERENCES households(id), user_id TEXT REFERENCES users(id), membership_id TEXT, session_epoch INTEGER, oauth_attempt_sequence INTEGER REFERENCES oauth_login_attempts(sequence), FOREIGN KEY(membership_id,user_id,household_id) REFERENCES household_memberships(id,user_id,household_id), CHECK((auth_method IN (''password'',''passkey'') AND user_id IS NULL AND membership_id IS NULL AND session_epoch IS NULL AND oauth_attempt_sequence IS NULL) OR (auth_method=''google'' AND user_id IS NOT NULL AND membership_id IS NOT NULL AND session_epoch IS NOT NULL AND typeof(session_epoch)=''integer'' AND session_epoch BETWEEN 0 AND 9007199254740991 AND oauth_attempt_sequence IS NOT NULL)))');

INSERT INTO _firebase_expected_schema VALUES('table','users','users','CREATE TABLE users (
  id TEXT NOT NULL PRIMARY KEY CHECK(length(trim(id)) > 0),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  session_epoch INTEGER NOT NULL DEFAULT 0 CHECK(typeof(session_epoch)=''integer'' AND session_epoch BETWEEN 0 AND 9007199254740991),
  oauth_attempt_floor INTEGER NOT NULL DEFAULT 0 CHECK(typeof(oauth_attempt_floor)=''integer'' AND oauth_attempt_floor BETWEEN 0 AND 9007199254740991),
  created_at TEXT NOT NULL CHECK(julianday(created_at) IS NOT NULL),
  updated_at TEXT NOT NULL CHECK(julianday(updated_at) IS NOT NULL)
)');

INSERT INTO _firebase_expected_schema VALUES('table','waitlist_entries','waitlist_entries','CREATE TABLE waitlist_entries (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  price_intent TEXT NOT NULL CHECK (price_intent IN (''free_only'', ''paid_ok'')),
  simulator_used INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
)');

INSERT INTO _firebase_expected_schema VALUES('table','webauthn_challenges','webauthn_challenges','CREATE TABLE "webauthn_challenges" (
  id TEXT PRIMARY KEY,
  challenge TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN (''registration'', ''authentication'')),
  person TEXT CHECK (person IN (''husband'', ''wife'')),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
, household_id TEXT REFERENCES households(id), CHECK((type=''registration'' AND household_id IS NOT NULL) OR (type=''authentication'' AND household_id IS NULL)))');

INSERT INTO _firebase_expected_schema VALUES('trigger','ai_diagnoses_household_insert','ai_diagnoses','CREATE TRIGGER ai_diagnoses_household_insert BEFORE INSERT ON ai_diagnoses WHEN NEW.household_id IS NULL BEGIN SELECT RAISE(ABORT,''HOUSEHOLD_REQUIRED''); END');

INSERT INTO _firebase_expected_schema VALUES('trigger','ai_diagnoses_household_update','ai_diagnoses','CREATE TRIGGER ai_diagnoses_household_update BEFORE UPDATE ON ai_diagnoses WHEN (NEW.household_id IS NULL) OR OLD.household_id IS NOT NEW.household_id BEGIN SELECT RAISE(ABORT,''HOUSEHOLD_IMMUTABLE''); END');

INSERT INTO _firebase_expected_schema VALUES('trigger','ai_diagnosis_source_revision_household_insert','ai_diagnosis_source_revision','CREATE TRIGGER ai_diagnosis_source_revision_household_insert BEFORE INSERT ON ai_diagnosis_source_revision WHEN NEW.household_id IS NULL BEGIN SELECT RAISE(ABORT,''HOUSEHOLD_REQUIRED''); END');

INSERT INTO _firebase_expected_schema VALUES('trigger','ai_diagnosis_source_revision_household_update','ai_diagnosis_source_revision','CREATE TRIGGER ai_diagnosis_source_revision_household_update BEFORE UPDATE ON ai_diagnosis_source_revision WHEN (NEW.household_id IS NULL) OR OLD.household_id IS NOT NEW.household_id BEGIN SELECT RAISE(ABORT,''HOUSEHOLD_IMMUTABLE''); END');

INSERT INTO _firebase_expected_schema VALUES('trigger','ai_execution_guard_household_insert','ai_execution_guard','CREATE TRIGGER ai_execution_guard_household_insert BEFORE INSERT ON ai_execution_guard WHEN NEW.household_id IS NULL BEGIN SELECT RAISE(ABORT,''HOUSEHOLD_REQUIRED''); END');

INSERT INTO _firebase_expected_schema VALUES('trigger','ai_execution_guard_household_update','ai_execution_guard','CREATE TRIGGER ai_execution_guard_household_update BEFORE UPDATE ON ai_execution_guard WHEN (NEW.household_id IS NULL) OR OLD.household_id IS NOT NEW.household_id BEGIN SELECT RAISE(ABORT,''HOUSEHOLD_IMMUTABLE''); END');

INSERT INTO _firebase_expected_schema VALUES('trigger','carryovers_household_insert','carryovers','CREATE TRIGGER carryovers_household_insert BEFORE INSERT ON carryovers WHEN NEW.household_id IS NULL BEGIN SELECT RAISE(ABORT,''HOUSEHOLD_REQUIRED''); END');

INSERT INTO _firebase_expected_schema VALUES('trigger','carryovers_household_update','carryovers','CREATE TRIGGER carryovers_household_update BEFORE UPDATE ON carryovers WHEN (NEW.household_id IS NULL) OR OLD.household_id IS NOT NEW.household_id BEGIN SELECT RAISE(ABORT,''HOUSEHOLD_IMMUTABLE''); END');

INSERT INTO _firebase_expected_schema VALUES('trigger','carryovers_payment_delete','carryovers','CREATE TRIGGER carryovers_payment_delete AFTER DELETE ON carryovers BEGIN
 INSERT INTO month_payment_revisions(household_id,month,revision) VALUES(OLD.household_id,OLD.month,1) ON CONFLICT(household_id,month) DO UPDATE SET revision=revision+1;
END');

INSERT INTO _firebase_expected_schema VALUES('trigger','carryovers_payment_insert','carryovers','CREATE TRIGGER carryovers_payment_insert AFTER INSERT ON carryovers BEGIN
 INSERT INTO month_payment_revisions(household_id,month,revision) VALUES(NEW.household_id,NEW.month,1) ON CONFLICT(household_id,month) DO UPDATE SET revision=revision+1;
END');

INSERT INTO _firebase_expected_schema VALUES('trigger','carryovers_payment_update','carryovers','CREATE TRIGGER carryovers_payment_update AFTER UPDATE OF id, month, label, amount, person, created_at, is_cleared ON carryovers BEGIN
 INSERT INTO month_payment_revisions(household_id,month,revision) VALUES(OLD.household_id,OLD.month,1) ON CONFLICT(household_id,month) DO UPDATE SET revision=revision+1;
 INSERT INTO month_payment_revisions(household_id,month,revision) SELECT NEW.household_id,NEW.month,1 WHERE NEW.month != OLD.month ON CONFLICT(household_id,month) DO UPDATE SET revision=revision+1;
END');

INSERT INTO _firebase_expected_schema VALUES('trigger','challenges_legacy_insert','webauthn_challenges','CREATE TRIGGER challenges_legacy_insert BEFORE INSERT ON webauthn_challenges
WHEN NEW.type=''registration'' AND EXISTS(SELECT 1 FROM households WHERE id=NEW.household_id AND legacy_auth_disabled_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT,''LEGACY_AUTH_DISABLED''); END');

INSERT INTO _firebase_expected_schema VALUES('trigger','challenges_legacy_update','webauthn_challenges','CREATE TRIGGER challenges_legacy_update BEFORE UPDATE ON webauthn_challenges
WHEN NEW.type=''registration'' AND EXISTS(SELECT 1 FROM households WHERE id=NEW.household_id AND legacy_auth_disabled_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT,''LEGACY_AUTH_DISABLED''); END');

INSERT INTO _firebase_expected_schema VALUES('trigger','expenses_household_insert','expenses','CREATE TRIGGER expenses_household_insert BEFORE INSERT ON expenses WHEN NEW.household_id IS NULL BEGIN SELECT RAISE(ABORT,''HOUSEHOLD_REQUIRED''); END');

INSERT INTO _firebase_expected_schema VALUES('trigger','expenses_household_update','expenses','CREATE TRIGGER expenses_household_update BEFORE UPDATE ON expenses WHEN (NEW.household_id IS NULL) OR OLD.household_id IS NOT NEW.household_id BEGIN SELECT RAISE(ABORT,''HOUSEHOLD_IMMUTABLE''); END');

INSERT INTO _firebase_expected_schema VALUES('trigger','expenses_payment_delete','expenses','CREATE TRIGGER expenses_payment_delete AFTER DELETE ON expenses BEGIN
 INSERT INTO month_payment_revisions(household_id,month,revision) VALUES(OLD.household_id,OLD.month,1) ON CONFLICT(household_id,month) DO UPDATE SET revision=revision+1;
END');

INSERT INTO _firebase_expected_schema VALUES('trigger','expenses_payment_insert','expenses','CREATE TRIGGER expenses_payment_insert AFTER INSERT ON expenses BEGIN
 INSERT INTO month_payment_revisions(household_id,month,revision) VALUES(NEW.household_id,NEW.month,1) ON CONFLICT(household_id,month) DO UPDATE SET revision=revision+1;
END');

INSERT INTO _firebase_expected_schema VALUES('trigger','expenses_payment_update','expenses','CREATE TRIGGER expenses_payment_update AFTER UPDATE OF id, month, label, amount, person, created_at, is_carryover ON expenses BEGIN
 INSERT INTO month_payment_revisions(household_id,month,revision) VALUES(OLD.household_id,OLD.month,1) ON CONFLICT(household_id,month) DO UPDATE SET revision=revision+1;
 INSERT INTO month_payment_revisions(household_id,month,revision) SELECT NEW.household_id,NEW.month,1 WHERE NEW.month != OLD.month ON CONFLICT(household_id,month) DO UPDATE SET revision=revision+1;
END');

INSERT INTO _firebase_expected_schema VALUES('trigger','google_identities_immutable','google_identities','CREATE TRIGGER google_identities_immutable BEFORE UPDATE ON google_identities
WHEN NEW.id IS NOT OLD.id OR NEW.user_id IS NOT OLD.user_id OR NEW.issuer IS NOT OLD.issuer OR NEW.subject IS NOT OLD.subject OR NEW.created_at IS NOT OLD.created_at OR (OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS NOT OLD.revoked_at)
BEGIN SELECT RAISE(ABORT,''GOOGLE_IDENTITY_IMMUTABLE''); END');

INSERT INTO _firebase_expected_schema VALUES('trigger','google_identities_no_delete','google_identities','CREATE TRIGGER google_identities_no_delete BEFORE DELETE ON google_identities BEGIN SELECT RAISE(ABORT,''GOOGLE_IDENTITY_HISTORY_REQUIRED''); END');

INSERT INTO _firebase_expected_schema VALUES('trigger','households_legacy_stop_immutable','households','CREATE TRIGGER households_legacy_stop_immutable BEFORE UPDATE OF legacy_auth_disabled_at ON households
WHEN OLD.legacy_auth_disabled_at IS NOT NULL AND NEW.legacy_auth_disabled_at IS NOT OLD.legacy_auth_disabled_at
BEGIN SELECT RAISE(ABORT,''LEGACY_STOP_IMMUTABLE''); END');

INSERT INTO _firebase_expected_schema VALUES('trigger','households_legacy_stop_sessions','households','CREATE TRIGGER households_legacy_stop_sessions AFTER UPDATE OF legacy_auth_disabled_at ON households
WHEN OLD.legacy_auth_disabled_at IS NULL AND NEW.legacy_auth_disabled_at IS NOT NULL
BEGIN DELETE FROM sessions WHERE household_id=NEW.id AND auth_method IN (''password'',''passkey''); END');

INSERT INTO _firebase_expected_schema VALUES('trigger','incomes_household_insert','incomes','CREATE TRIGGER incomes_household_insert BEFORE INSERT ON incomes WHEN NEW.household_id IS NULL BEGIN SELECT RAISE(ABORT,''HOUSEHOLD_REQUIRED''); END');

INSERT INTO _firebase_expected_schema VALUES('trigger','incomes_household_update','incomes','CREATE TRIGGER incomes_household_update BEFORE UPDATE ON incomes WHEN (NEW.household_id IS NULL) OR OLD.household_id IS NOT NEW.household_id BEGIN SELECT RAISE(ABORT,''HOUSEHOLD_IMMUTABLE''); END');

INSERT INTO _firebase_expected_schema VALUES('trigger','incomes_payment_delete','incomes','CREATE TRIGGER incomes_payment_delete AFTER DELETE ON incomes BEGIN
 INSERT INTO month_payment_revisions(household_id,month,revision) VALUES(OLD.household_id,OLD.month,1) ON CONFLICT(household_id,month) DO UPDATE SET revision=revision+1;
END');

INSERT INTO _firebase_expected_schema VALUES('trigger','incomes_payment_insert','incomes','CREATE TRIGGER incomes_payment_insert AFTER INSERT ON incomes BEGIN
 INSERT INTO month_payment_revisions(household_id,month,revision) VALUES(NEW.household_id,NEW.month,1) ON CONFLICT(household_id,month) DO UPDATE SET revision=revision+1;
END');

INSERT INTO _firebase_expected_schema VALUES('trigger','incomes_payment_update','incomes','CREATE TRIGGER incomes_payment_update AFTER UPDATE OF id, month, label, amount, person, created_at ON incomes BEGIN
 INSERT INTO month_payment_revisions(household_id,month,revision) VALUES(OLD.household_id,OLD.month,1) ON CONFLICT(household_id,month) DO UPDATE SET revision=revision+1;
 INSERT INTO month_payment_revisions(household_id,month,revision) SELECT NEW.household_id,NEW.month,1 WHERE NEW.month != OLD.month ON CONFLICT(household_id,month) DO UPDATE SET revision=revision+1;
END');

INSERT INTO _firebase_expected_schema VALUES('trigger','increment_ai_revision_after_carryover_delete','carryovers','CREATE TRIGGER increment_ai_revision_after_carryover_delete
AFTER DELETE ON carryovers
BEGIN
 SELECT (CASE WHEN NOT EXISTS(SELECT 1 FROM ai_diagnosis_source_revision WHERE household_id=OLD.household_id) THEN RAISE(ABORT,''AI_REVISION_MISSING'') END);
  UPDATE ai_diagnosis_source_revision
  SET revision = revision + 1, updated_at = strftime(''%Y-%m-%dT%H:%M:%fZ'', ''now'')
  WHERE household_id = OLD.household_id;
END');

INSERT INTO _firebase_expected_schema VALUES('trigger','increment_ai_revision_after_carryover_insert','carryovers','CREATE TRIGGER increment_ai_revision_after_carryover_insert
AFTER INSERT ON carryovers
BEGIN
 SELECT (CASE WHEN NOT EXISTS(SELECT 1 FROM ai_diagnosis_source_revision WHERE household_id=NEW.household_id) THEN RAISE(ABORT,''AI_REVISION_MISSING'') END);
  UPDATE ai_diagnosis_source_revision
  SET revision = revision + 1, updated_at = strftime(''%Y-%m-%dT%H:%M:%fZ'', ''now'')
  WHERE household_id = NEW.household_id;
END');

INSERT INTO _firebase_expected_schema VALUES('trigger','increment_ai_revision_after_carryover_update','carryovers','CREATE TRIGGER increment_ai_revision_after_carryover_update
AFTER UPDATE OF month, amount, is_cleared ON carryovers
WHEN OLD.month IS NOT NEW.month
  OR OLD.amount IS NOT NEW.amount
  OR OLD.is_cleared IS NOT NEW.is_cleared
BEGIN
 SELECT (CASE WHEN NOT EXISTS(SELECT 1 FROM ai_diagnosis_source_revision WHERE household_id=NEW.household_id) THEN RAISE(ABORT,''AI_REVISION_MISSING'') END);
  UPDATE ai_diagnosis_source_revision
  SET revision = revision + 1, updated_at = strftime(''%Y-%m-%dT%H:%M:%fZ'', ''now'')
  WHERE household_id = NEW.household_id;
END');

INSERT INTO _firebase_expected_schema VALUES('trigger','increment_ai_revision_after_expense_delete','expenses','CREATE TRIGGER increment_ai_revision_after_expense_delete
AFTER DELETE ON expenses
BEGIN
 SELECT (CASE WHEN NOT EXISTS(SELECT 1 FROM ai_diagnosis_source_revision WHERE household_id=OLD.household_id) THEN RAISE(ABORT,''AI_REVISION_MISSING'') END);
  UPDATE ai_diagnosis_source_revision
  SET revision = revision + 1, updated_at = strftime(''%Y-%m-%dT%H:%M:%fZ'', ''now'')
  WHERE household_id = OLD.household_id;
END');

INSERT INTO _firebase_expected_schema VALUES('trigger','increment_ai_revision_after_expense_insert','expenses','CREATE TRIGGER increment_ai_revision_after_expense_insert
AFTER INSERT ON expenses
BEGIN
 SELECT (CASE WHEN NOT EXISTS(SELECT 1 FROM ai_diagnosis_source_revision WHERE household_id=NEW.household_id) THEN RAISE(ABORT,''AI_REVISION_MISSING'') END);
  UPDATE ai_diagnosis_source_revision
  SET revision = revision + 1, updated_at = strftime(''%Y-%m-%dT%H:%M:%fZ'', ''now'')
  WHERE household_id = NEW.household_id;
END');

INSERT INTO _firebase_expected_schema VALUES('trigger','increment_ai_revision_after_expense_update','expenses','CREATE TRIGGER increment_ai_revision_after_expense_update
AFTER UPDATE OF month, label, amount, is_carryover ON expenses
WHEN OLD.month IS NOT NEW.month
  OR OLD.label IS NOT NEW.label
  OR OLD.amount IS NOT NEW.amount
  OR OLD.is_carryover IS NOT NEW.is_carryover
BEGIN
 SELECT (CASE WHEN NOT EXISTS(SELECT 1 FROM ai_diagnosis_source_revision WHERE household_id=NEW.household_id) THEN RAISE(ABORT,''AI_REVISION_MISSING'') END);
  UPDATE ai_diagnosis_source_revision
  SET revision = revision + 1, updated_at = strftime(''%Y-%m-%dT%H:%M:%fZ'', ''now'')
  WHERE household_id = NEW.household_id;
END');

INSERT INTO _firebase_expected_schema VALUES('trigger','increment_ai_revision_after_income_delete','incomes','CREATE TRIGGER increment_ai_revision_after_income_delete
AFTER DELETE ON incomes
BEGIN
 SELECT (CASE WHEN NOT EXISTS(SELECT 1 FROM ai_diagnosis_source_revision WHERE household_id=OLD.household_id) THEN RAISE(ABORT,''AI_REVISION_MISSING'') END);
  UPDATE ai_diagnosis_source_revision
  SET revision = revision + 1, updated_at = strftime(''%Y-%m-%dT%H:%M:%fZ'', ''now'')
  WHERE household_id = OLD.household_id;
END');

INSERT INTO _firebase_expected_schema VALUES('trigger','increment_ai_revision_after_income_insert','incomes','CREATE TRIGGER increment_ai_revision_after_income_insert
AFTER INSERT ON incomes
BEGIN
 SELECT (CASE WHEN NOT EXISTS(SELECT 1 FROM ai_diagnosis_source_revision WHERE household_id=NEW.household_id) THEN RAISE(ABORT,''AI_REVISION_MISSING'') END);
  UPDATE ai_diagnosis_source_revision
  SET revision = revision + 1, updated_at = strftime(''%Y-%m-%dT%H:%M:%fZ'', ''now'')
  WHERE household_id = NEW.household_id;
END');

INSERT INTO _firebase_expected_schema VALUES('trigger','increment_ai_revision_after_income_update','incomes','CREATE TRIGGER increment_ai_revision_after_income_update
AFTER UPDATE OF month, amount ON incomes
WHEN OLD.month IS NOT NEW.month OR OLD.amount IS NOT NEW.amount
BEGIN
 SELECT (CASE WHEN NOT EXISTS(SELECT 1 FROM ai_diagnosis_source_revision WHERE household_id=NEW.household_id) THEN RAISE(ABORT,''AI_REVISION_MISSING'') END);
  UPDATE ai_diagnosis_source_revision
  SET revision = revision + 1, updated_at = strftime(''%Y-%m-%dT%H:%M:%fZ'', ''now'')
  WHERE household_id = NEW.household_id;
END');

INSERT INTO _firebase_expected_schema VALUES('trigger','memberships_immutable','household_memberships','CREATE TRIGGER memberships_immutable BEFORE UPDATE ON household_memberships
WHEN NEW.id IS NOT OLD.id OR NEW.user_id IS NOT OLD.user_id OR NEW.household_id IS NOT OLD.household_id OR NEW.created_at IS NOT OLD.created_at OR (OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS NOT OLD.revoked_at)
BEGIN SELECT RAISE(ABORT,''MEMBERSHIP_IMMUTABLE''); END');

INSERT INTO _firebase_expected_schema VALUES('trigger','memberships_no_delete','household_memberships','CREATE TRIGGER memberships_no_delete BEFORE DELETE ON household_memberships BEGIN SELECT RAISE(ABORT,''MEMBERSHIP_HISTORY_REQUIRED''); END');

INSERT INTO _firebase_expected_schema VALUES('trigger','memberships_revoke_sessions','household_memberships','CREATE TRIGGER memberships_revoke_sessions AFTER UPDATE OF revoked_at ON household_memberships
WHEN OLD.revoked_at IS NULL AND NEW.revoked_at IS NOT NULL
BEGIN
  UPDATE users SET session_epoch=session_epoch+1, oauth_attempt_floor=MAX(oauth_attempt_floor,COALESCE((SELECT MAX(sequence) FROM oauth_login_attempts),0)), updated_at=NEW.revoked_at WHERE id=NEW.user_id;
END');

INSERT INTO _firebase_expected_schema VALUES('trigger','migration_requests_approval','google_migration_requests','CREATE TRIGGER migration_requests_approval BEFORE UPDATE OF status ON google_migration_requests
WHEN NEW.status=''approved''
BEGIN
  SELECT (CASE WHEN (NEW.purpose=''legacy_enrollment'' AND NOT EXISTS(SELECT 1 FROM households WHERE id=NEW.approved_household_id AND legacy_auth_key=''legacy'' AND legacy_auth_disabled_at IS NULL))
    OR (NEW.purpose=''identity_recovery'' AND NOT EXISTS(SELECT 1 FROM users u JOIN google_identities i ON i.user_id=u.id WHERE u.id=NEW.target_user_id AND u.active=1 AND u.session_epoch=NEW.expected_session_epoch AND i.id=NEW.expected_old_identity_id))
  THEN RAISE(ABORT,''MIGRATION_APPROVAL_TARGET'') END);
END');

INSERT INTO _firebase_expected_schema VALUES('trigger','migration_requests_immutable','google_migration_requests','CREATE TRIGGER migration_requests_immutable BEFORE UPDATE ON google_migration_requests
WHEN NEW.id IS NOT OLD.id OR (NEW.purpose IS NOT OLD.purpose AND NOT(OLD.status=''pending'' AND NEW.status=''approved'' AND OLD.purpose=''legacy_enrollment'' AND NEW.purpose=''identity_recovery'')) OR NEW.issuer IS NOT OLD.issuer OR NEW.subject IS NOT OLD.subject OR NEW.code_hash IS NOT OLD.code_hash OR NEW.browser_binding_hash IS NOT OLD.browser_binding_hash OR NEW.created_at IS NOT OLD.created_at OR NEW.expires_at IS NOT OLD.expires_at
  OR (OLD.approved_at IS NOT NULL AND (NEW.approved_at IS NOT OLD.approved_at OR NEW.approval_expires_at IS NOT OLD.approval_expires_at OR NEW.approved_by IS NOT OLD.approved_by OR NEW.confirmation_ref IS NOT OLD.confirmation_ref OR NEW.approved_household_id IS NOT OLD.approved_household_id OR NEW.approved_default_person IS NOT OLD.approved_default_person OR NEW.legacy_slot IS NOT OLD.legacy_slot OR NEW.target_user_id IS NOT OLD.target_user_id OR NEW.expected_old_identity_id IS NOT OLD.expected_old_identity_id OR NEW.expected_session_epoch IS NOT OLD.expected_session_epoch))
  OR (OLD.consumption_id IS NOT NULL AND NEW.consumption_id IS NOT OLD.consumption_id)
  OR (OLD.status=''pending'' AND NEW.status NOT IN (''approved'',''canceled'',''expired''))
  OR (OLD.status=''approved'' AND NEW.status NOT IN (''consuming'',''canceled'',''expired''))
  OR (OLD.status=''consuming'' AND NEW.status <> ''consumed'') OR OLD.status IN (''consumed'',''canceled'',''expired'')
BEGIN SELECT RAISE(ABORT,''MIGRATION_REQUEST_STATE''); END');

INSERT INTO _firebase_expected_schema VALUES('trigger','migration_requests_no_consumed_delete','google_migration_requests','CREATE TRIGGER migration_requests_no_consumed_delete BEFORE DELETE ON google_migration_requests WHEN OLD.status IN (''consuming'',''consumed'')
BEGIN SELECT RAISE(ABORT,''MIGRATION_HISTORY_REQUIRED''); END');

INSERT INTO _firebase_expected_schema VALUES('trigger','migration_requests_pending_insert','google_migration_requests','CREATE TRIGGER migration_requests_pending_insert BEFORE INSERT ON google_migration_requests WHEN NEW.status <> ''pending''
BEGIN SELECT RAISE(ABORT,''MIGRATION_REQUEST_STATE''); END');

INSERT INTO _firebase_expected_schema VALUES('trigger','month_payment_revisions_household_insert','month_payment_revisions','CREATE TRIGGER month_payment_revisions_household_insert BEFORE INSERT ON month_payment_revisions WHEN NEW.household_id IS NULL BEGIN SELECT RAISE(ABORT,''HOUSEHOLD_REQUIRED''); END');

INSERT INTO _firebase_expected_schema VALUES('trigger','month_payment_revisions_household_update','month_payment_revisions','CREATE TRIGGER month_payment_revisions_household_update BEFORE UPDATE ON month_payment_revisions WHEN (NEW.household_id IS NULL) OR OLD.household_id IS NOT NEW.household_id BEGIN SELECT RAISE(ABORT,''HOUSEHOLD_IMMUTABLE''); END');

INSERT INTO _firebase_expected_schema VALUES('trigger','oauth_attempts_immutable','oauth_login_attempts','CREATE TRIGGER oauth_attempts_immutable BEFORE UPDATE ON oauth_login_attempts
WHEN NEW.sequence IS NOT OLD.sequence OR NEW.id IS NOT OLD.id OR NEW.browser_binding_hash IS NOT OLD.browser_binding_hash OR NEW.state_hash IS NOT OLD.state_hash OR NEW.created_at IS NOT OLD.created_at OR NEW.expires_at IS NOT OLD.expires_at
  OR (OLD.claim_id IS NOT NULL AND (NEW.claim_id IS NOT OLD.claim_id OR NEW.claimed_at IS NOT OLD.claimed_at))
  OR (OLD.status=''pending'' AND NEW.status NOT IN (''processing'',''failed'',''expired''))
  OR (OLD.status=''processing'' AND NEW.status NOT IN (''completed'',''failed'',''expired''))
  OR OLD.status IN (''completed'',''failed'',''expired'')
BEGIN SELECT RAISE(ABORT,''OAUTH_ATTEMPT_STATE''); END');

INSERT INTO _firebase_expected_schema VALUES('trigger','oauth_attempts_pending_insert','oauth_login_attempts','CREATE TRIGGER oauth_attempts_pending_insert BEFORE INSERT ON oauth_login_attempts WHEN NEW.status <> ''pending''
BEGIN SELECT RAISE(ABORT,''OAUTH_ATTEMPT_STATE''); END');

INSERT INTO _firebase_expected_schema VALUES('trigger','passkey_credentials_household_insert','passkey_credentials','CREATE TRIGGER passkey_credentials_household_insert BEFORE INSERT ON passkey_credentials WHEN NEW.household_id IS NULL BEGIN SELECT RAISE(ABORT,''HOUSEHOLD_REQUIRED''); END');

INSERT INTO _firebase_expected_schema VALUES('trigger','passkey_credentials_household_update','passkey_credentials','CREATE TRIGGER passkey_credentials_household_update BEFORE UPDATE ON passkey_credentials WHEN (NEW.household_id IS NULL) OR OLD.household_id IS NOT NEW.household_id BEGIN SELECT RAISE(ABORT,''HOUSEHOLD_IMMUTABLE''); END');

INSERT INTO _firebase_expected_schema VALUES('trigger','passkeys_legacy_insert','passkey_credentials','CREATE TRIGGER passkeys_legacy_insert BEFORE INSERT ON passkey_credentials
WHEN EXISTS(SELECT 1 FROM households WHERE id=NEW.household_id AND legacy_auth_disabled_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT,''LEGACY_AUTH_DISABLED''); END');

INSERT INTO _firebase_expected_schema VALUES('trigger','passkeys_legacy_update','passkey_credentials','CREATE TRIGGER passkeys_legacy_update BEFORE UPDATE ON passkey_credentials
WHEN EXISTS(SELECT 1 FROM households WHERE id=NEW.household_id AND legacy_auth_disabled_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT,''LEGACY_AUTH_DISABLED''); END');

INSERT INTO _firebase_expected_schema VALUES('trigger','payment_operation_revision','payment_operations','CREATE TRIGGER payment_operation_revision BEFORE INSERT ON payment_operations BEGIN
 SELECT (CASE WHEN COALESCE((SELECT revision FROM month_payment_revisions WHERE household_id = NEW.household_id AND month = NEW.month),0) != NEW.expected_revision THEN RAISE(ABORT,''PAYMENT_REVISION_CONFLICT'') END);
END');

INSERT INTO _firebase_expected_schema VALUES('trigger','payment_operations_immutable_delete','payment_operations','CREATE TRIGGER payment_operations_immutable_delete BEFORE DELETE ON payment_operations BEGIN SELECT RAISE(ABORT,''PAYMENT_IMMUTABLE''); END');

INSERT INTO _firebase_expected_schema VALUES('trigger','payment_operations_immutable_update','payment_operations','CREATE TRIGGER payment_operations_immutable_update BEFORE UPDATE ON payment_operations BEGIN SELECT RAISE(ABORT,''PAYMENT_IMMUTABLE''); END');

INSERT INTO _firebase_expected_schema VALUES('trigger','payment_record_operation','payment_records','CREATE TRIGGER payment_record_operation BEFORE INSERT ON payment_records BEGIN
 SELECT (CASE WHEN NOT EXISTS(SELECT 1 FROM payment_operations WHERE household_id = NEW.household_id AND id = NEW.operation_id AND month = NEW.month AND kind IN (''record'',''correct'')) THEN RAISE(ABORT,''PAYMENT_OPERATION_INVALID'') END);
END');

INSERT INTO _firebase_expected_schema VALUES('trigger','payment_records_immutable_delete','payment_records','CREATE TRIGGER payment_records_immutable_delete BEFORE DELETE ON payment_records BEGIN SELECT RAISE(ABORT,''PAYMENT_IMMUTABLE''); END');

INSERT INTO _firebase_expected_schema VALUES('trigger','payment_records_immutable_update','payment_records','CREATE TRIGGER payment_records_immutable_update BEFORE UPDATE ON payment_records BEGIN SELECT RAISE(ABORT,''PAYMENT_IMMUTABLE''); END');

INSERT INTO _firebase_expected_schema VALUES('trigger','payment_void_operation','payment_voids','CREATE TRIGGER payment_void_operation BEFORE INSERT ON payment_voids BEGIN
 SELECT (CASE WHEN NOT EXISTS(SELECT 1 FROM payment_operations o JOIN payment_records p ON p.household_id = o.household_id AND p.month = o.month WHERE o.household_id = NEW.household_id AND o.id = NEW.operation_id AND p.id = NEW.payment_id AND o.kind IN (''correct'',''void'')) THEN RAISE(ABORT,''PAYMENT_OPERATION_INVALID'') END);
END');

INSERT INTO _firebase_expected_schema VALUES('trigger','payment_voids_immutable_delete','payment_voids','CREATE TRIGGER payment_voids_immutable_delete BEFORE DELETE ON payment_voids BEGIN SELECT RAISE(ABORT,''PAYMENT_IMMUTABLE''); END');

INSERT INTO _firebase_expected_schema VALUES('trigger','payment_voids_immutable_update','payment_voids','CREATE TRIGGER payment_voids_immutable_update BEFORE UPDATE ON payment_voids BEGIN SELECT RAISE(ABORT,''PAYMENT_IMMUTABLE''); END');

INSERT INTO _firebase_expected_schema VALUES('trigger','release_ai_execution_guard','ai_diagnoses','CREATE TRIGGER release_ai_execution_guard
AFTER UPDATE OF run_token ON ai_diagnoses
WHEN OLD.run_token IS NOT NULL AND NEW.run_token IS NULL
BEGIN
  UPDATE ai_execution_guard
  SET run_token = NULL, run_expires_at = NULL
  WHERE household_id = NEW.household_id AND run_token = OLD.run_token;
END');

INSERT INTO _firebase_expected_schema VALUES('trigger','sessions_auth_immutable','sessions','CREATE TRIGGER sessions_auth_immutable BEFORE UPDATE ON sessions
WHEN NEW.token IS NOT OLD.token OR NEW.user_id IS NOT OLD.user_id OR NEW.membership_id IS NOT OLD.membership_id OR NEW.household_id IS NOT OLD.household_id OR NEW.auth_method IS NOT OLD.auth_method OR NEW.session_epoch IS NOT OLD.session_epoch OR NEW.oauth_attempt_sequence IS NOT OLD.oauth_attempt_sequence
BEGIN SELECT RAISE(ABORT,''SESSION_AUTH_IMMUTABLE''); END');

INSERT INTO _firebase_expected_schema VALUES('trigger','sessions_google_insert','sessions','CREATE TRIGGER sessions_google_insert BEFORE INSERT ON sessions WHEN NEW.auth_method=''google''
BEGIN
  SELECT (CASE WHEN NOT EXISTS(
    SELECT 1 FROM users u
    JOIN household_memberships m ON m.user_id=u.id AND m.id=NEW.membership_id AND m.household_id=NEW.household_id
    JOIN google_identities i ON i.user_id=u.id AND i.revoked_at IS NULL
    JOIN oauth_login_attempts a ON a.sequence=NEW.oauth_attempt_sequence AND a.verified_issuer=i.issuer AND a.verified_subject=i.subject
    WHERE u.id=NEW.user_id AND u.active=1 AND u.session_epoch=NEW.session_epoch AND m.revoked_at IS NULL
      AND a.status=''completed'' AND a.claim_id IS NOT NULL AND a.sequence>u.oauth_attempt_floor
      AND julianday(a.expires_at)>julianday(NEW.created_at) AND julianday(a.expires_at)>julianday(''now'')
      AND julianday(NEW.expires_at)>julianday(NEW.created_at)
  ) THEN RAISE(ABORT,''GOOGLE_SESSION_INVALID'') END);
END');

INSERT INTO _firebase_expected_schema VALUES('trigger','sessions_household_insert','sessions','CREATE TRIGGER sessions_household_insert BEFORE INSERT ON sessions WHEN NEW.household_id IS NULL BEGIN SELECT RAISE(ABORT,''HOUSEHOLD_REQUIRED''); END');

INSERT INTO _firebase_expected_schema VALUES('trigger','sessions_household_update','sessions','CREATE TRIGGER sessions_household_update BEFORE UPDATE ON sessions WHEN (NEW.household_id IS NULL) OR OLD.household_id IS NOT NEW.household_id BEGIN SELECT RAISE(ABORT,''HOUSEHOLD_IMMUTABLE''); END');

INSERT INTO _firebase_expected_schema VALUES('trigger','sessions_legacy_insert','sessions','CREATE TRIGGER sessions_legacy_insert BEFORE INSERT ON sessions
WHEN NEW.auth_method IN (''password'',''passkey'') AND EXISTS(SELECT 1 FROM households WHERE id=NEW.household_id AND legacy_auth_disabled_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT,''LEGACY_AUTH_DISABLED''); END');

INSERT INTO _firebase_expected_schema VALUES('trigger','sessions_legacy_update','sessions','CREATE TRIGGER sessions_legacy_update BEFORE UPDATE ON sessions
WHEN NEW.auth_method IN (''password'',''passkey'') AND EXISTS(SELECT 1 FROM households WHERE id=NEW.household_id AND legacy_auth_disabled_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT,''LEGACY_AUTH_DISABLED''); END');

INSERT INTO _firebase_expected_schema VALUES('trigger','users_auth_immutable','users','CREATE TRIGGER users_auth_immutable BEFORE UPDATE ON users
WHEN NEW.id IS NOT OLD.id OR NEW.created_at IS NOT OLD.created_at OR NEW.session_epoch < OLD.session_epoch OR NEW.oauth_attempt_floor < OLD.oauth_attempt_floor
  OR (NEW.active IS NOT OLD.active AND (NEW.session_epoch <= OLD.session_epoch OR NEW.oauth_attempt_floor < COALESCE((SELECT MAX(sequence) FROM oauth_login_attempts),0)))
BEGIN SELECT RAISE(ABORT,''USER_AUTH_IMMUTABLE''); END');

INSERT INTO _firebase_expected_schema VALUES('trigger','users_no_delete','users','CREATE TRIGGER users_no_delete BEFORE DELETE ON users BEGIN SELECT RAISE(ABORT,''USER_HISTORY_REQUIRED''); END');

INSERT INTO _firebase_expected_schema VALUES('trigger','webauthn_challenges_household_insert','webauthn_challenges','CREATE TRIGGER webauthn_challenges_household_insert BEFORE INSERT ON webauthn_challenges WHEN NEW.type NOT IN (''registration'',''authentication'') OR NEW.type IS NULL OR (NEW.type=''registration'' AND NEW.household_id IS NULL) OR (NEW.type=''authentication'' AND NEW.household_id IS NOT NULL) BEGIN SELECT RAISE(ABORT,''HOUSEHOLD_REQUIRED''); END');

INSERT INTO _firebase_expected_schema VALUES('trigger','webauthn_challenges_household_update','webauthn_challenges','CREATE TRIGGER webauthn_challenges_household_update BEFORE UPDATE ON webauthn_challenges WHEN (NEW.type NOT IN (''registration'',''authentication'') OR NEW.type IS NULL OR (NEW.type=''registration'' AND NEW.household_id IS NULL) OR (NEW.type=''authentication'' AND NEW.household_id IS NOT NULL)) OR OLD.household_id IS NOT NEW.household_id BEGIN SELECT RAISE(ABORT,''HOUSEHOLD_IMMUTABLE''); END');

INSERT INTO _firebase_migration_assert SELECT CASE WHEN NOT EXISTS(SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE name NOT GLOB 'sqlite_*' AND name NOT IN ('_cf_KV','_cf_METADATA','d1_migrations','_firebase_migration_assert','_firebase_expected_schema') EXCEPT SELECT type,name,tbl_name,sql FROM _firebase_expected_schema) AND NOT EXISTS(SELECT type,name,tbl_name,sql FROM _firebase_expected_schema EXCEPT SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE name NOT GLOB 'sqlite_*' AND name NOT IN ('_cf_KV','_cf_METADATA','d1_migrations','_firebase_migration_assert','_firebase_expected_schema')) THEN 1 ELSE 0 END;

INSERT INTO _firebase_migration_assert SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM pragma_foreign_key_check) THEN 1 ELSE 0 END;

DROP TABLE _firebase_expected_schema;

ALTER TABLE users ADD COLUMN firebase_auth_time_floor INTEGER NOT NULL DEFAULT 0 CHECK(typeof(firebase_auth_time_floor)='integer' AND firebase_auth_time_floor BETWEEN 0 AND 9007199254740991);

CREATE TABLE firebase_identities (
 id TEXT NOT NULL PRIMARY KEY CHECK(length(trim(id))>0),
 user_id TEXT NOT NULL REFERENCES users(id), project_id TEXT NOT NULL CHECK(length(trim(project_id))>0),
 uid TEXT NOT NULL CHECK(length(uid) BETWEEN 1 AND 128), email TEXT,
 created_at TEXT NOT NULL CHECK(julianday(created_at) IS NOT NULL),
 revoked_at TEXT CHECK(revoked_at IS NULL OR julianday(revoked_at) IS NOT NULL),
 UNIQUE(project_id,uid), UNIQUE(id,user_id)
);
CREATE UNIQUE INDEX idx_firebase_active_user ON firebase_identities(user_id) WHERE revoked_at IS NULL;
CREATE TRIGGER firebase_identity_immutable BEFORE UPDATE ON firebase_identities
WHEN NEW.id IS NOT OLD.id OR NEW.user_id IS NOT OLD.user_id OR NEW.project_id IS NOT OLD.project_id OR NEW.uid IS NOT OLD.uid OR NEW.created_at IS NOT OLD.created_at OR (OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS NOT OLD.revoked_at)
BEGIN SELECT RAISE(ABORT,'FIREBASE_IDENTITY_IMMUTABLE'); END;
CREATE TRIGGER firebase_identity_history BEFORE DELETE ON firebase_identities BEGIN SELECT RAISE(ABORT,'FIREBASE_IDENTITY_HISTORY'); END;
CREATE TRIGGER firebase_floor_monotonic BEFORE UPDATE ON users WHEN NEW.firebase_auth_time_floor < OLD.firebase_auth_time_floor BEGIN SELECT RAISE(ABORT,'FIREBASE_FLOOR_IMMUTABLE'); END;
-- 既存Google処理によるepoch更新も同じ失効境界へ収束させる。
CREATE TRIGGER firebase_epoch_floor AFTER UPDATE OF session_epoch ON users WHEN NEW.session_epoch>OLD.session_epoch
BEGIN UPDATE users SET firebase_auth_time_floor=MAX(firebase_auth_time_floor,CAST(strftime('%s','now') AS INTEGER)) WHERE id=NEW.id; END;


CREATE TABLE firebase_migration_requests (
  id TEXT NOT NULL PRIMARY KEY CHECK(length(trim(id)) > 0),
  purpose TEXT NOT NULL CHECK(purpose IN ('legacy_enrollment','identity_recovery','identity_link')),
  project_id TEXT NOT NULL CHECK(length(trim(project_id))>0),
  uid TEXT NOT NULL CHECK(length(uid) BETWEEN 1 AND 128),
  email TEXT,
  code_hash TEXT NOT NULL UNIQUE CHECK(length(code_hash)=64 AND code_hash NOT GLOB '*[^0-9a-f]*'),
  browser_binding_hash TEXT NOT NULL CHECK(length(browser_binding_hash)=64 AND browser_binding_hash NOT GLOB '*[^0-9a-f]*'),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','consuming','consumed','canceled','expired')),
  created_at TEXT NOT NULL CHECK(julianday(created_at) IS NOT NULL),
  expires_at TEXT NOT NULL CHECK(julianday(expires_at) IS NOT NULL AND julianday(expires_at) > julianday(created_at)),
  approved_at TEXT CHECK(approved_at IS NULL OR julianday(approved_at) IS NOT NULL),
  approval_expires_at TEXT CHECK(approval_expires_at IS NULL OR julianday(approval_expires_at) IS NOT NULL),
  approved_by TEXT,
  confirmation_ref TEXT,
  approved_household_id TEXT REFERENCES households(id),
  approved_default_person TEXT CHECK(approved_default_person IS NULL OR approved_default_person IN ('husband','wife')),
  legacy_slot TEXT CHECK(legacy_slot IS NULL OR legacy_slot IN ('existing-member-1','existing-member-2')),
  target_user_id TEXT REFERENCES users(id),
  expected_old_identity_id TEXT REFERENCES firebase_identities(id),
  expected_session_epoch INTEGER CHECK(expected_session_epoch IS NULL OR (typeof(expected_session_epoch)='integer' AND expected_session_epoch BETWEEN 0 AND 9007199254740990)),
  consumption_id TEXT UNIQUE,
  consumed_at TEXT CHECK(consumed_at IS NULL OR julianday(consumed_at) IS NOT NULL),
  consumed_user_id TEXT REFERENCES users(id),
  CHECK((approved_at IS NULL AND approval_expires_at IS NULL AND approved_by IS NULL AND confirmation_ref IS NULL AND approved_household_id IS NULL AND approved_default_person IS NULL AND legacy_slot IS NULL AND target_user_id IS NULL AND expected_old_identity_id IS NULL AND expected_session_epoch IS NULL) OR
    (approved_at IS NOT NULL AND approval_expires_at IS NOT NULL AND julianday(approval_expires_at) > julianday(approved_at) AND julianday(approval_expires_at) <= julianday(expires_at) AND approved_by IS NOT NULL AND length(trim(approved_by)) > 0 AND confirmation_ref IS NOT NULL AND length(trim(confirmation_ref)) > 0 AND
      ((purpose='legacy_enrollment' AND approved_household_id IS NOT NULL AND approved_default_person IS NOT NULL AND legacy_slot IS NOT NULL AND target_user_id IS NULL AND expected_old_identity_id IS NULL AND expected_session_epoch IS NULL) OR
       (purpose IN ('identity_recovery','identity_link') AND target_user_id IS NOT NULL AND ((purpose='identity_recovery' AND expected_old_identity_id IS NOT NULL) OR (purpose='identity_link' AND expected_old_identity_id IS NULL)) AND expected_session_epoch IS NOT NULL AND approved_household_id IS NULL AND approved_default_person IS NULL AND legacy_slot IS NULL)))),
  CHECK((status='pending' AND approved_at IS NULL AND consumption_id IS NULL AND consumed_at IS NULL AND consumed_user_id IS NULL) OR
    (status='approved' AND approved_at IS NOT NULL AND consumption_id IS NULL AND consumed_at IS NULL AND consumed_user_id IS NULL) OR
    (status='consuming' AND approved_at IS NOT NULL AND consumption_id IS NOT NULL AND consumed_at IS NULL AND consumed_user_id IS NULL) OR
    (status='consumed' AND approved_at IS NOT NULL AND consumption_id IS NOT NULL AND consumed_at IS NOT NULL AND consumed_user_id IS NOT NULL) OR
    (status IN ('canceled','expired') AND consumption_id IS NULL AND consumed_at IS NULL AND consumed_user_id IS NULL))
);

CREATE UNIQUE INDEX idx_firebase_migration_active_subject ON firebase_migration_requests(project_id,uid) WHERE status IN ('approved','consuming');

CREATE UNIQUE INDEX idx_firebase_migration_legacy_slots ON firebase_migration_requests(approved_household_id,legacy_slot) WHERE purpose='legacy_enrollment' AND status IN ('approved','consuming','consumed');

CREATE INDEX idx_firebase_requests_expires ON firebase_migration_requests(expires_at);

CREATE TRIGGER firebase_requests_immutable BEFORE UPDATE ON firebase_migration_requests
WHEN NEW.id IS NOT OLD.id OR (NEW.purpose IS NOT OLD.purpose AND NOT(OLD.status='pending' AND NEW.status='approved' AND OLD.purpose='legacy_enrollment' AND NEW.purpose IN ('identity_recovery','identity_link'))) OR NEW.project_id IS NOT OLD.project_id OR NEW.uid IS NOT OLD.uid OR NEW.code_hash IS NOT OLD.code_hash OR NEW.browser_binding_hash IS NOT OLD.browser_binding_hash OR NEW.created_at IS NOT OLD.created_at OR NEW.expires_at IS NOT OLD.expires_at
  OR (OLD.approved_at IS NOT NULL AND (NEW.approved_at IS NOT OLD.approved_at OR NEW.approval_expires_at IS NOT OLD.approval_expires_at OR NEW.approved_by IS NOT OLD.approved_by OR NEW.confirmation_ref IS NOT OLD.confirmation_ref OR NEW.approved_household_id IS NOT OLD.approved_household_id OR NEW.approved_default_person IS NOT OLD.approved_default_person OR NEW.legacy_slot IS NOT OLD.legacy_slot OR NEW.target_user_id IS NOT OLD.target_user_id OR NEW.expected_old_identity_id IS NOT OLD.expected_old_identity_id OR NEW.expected_session_epoch IS NOT OLD.expected_session_epoch))
  OR (OLD.consumption_id IS NOT NULL AND NEW.consumption_id IS NOT OLD.consumption_id)
  OR (OLD.status='pending' AND NEW.status NOT IN ('approved','canceled','expired'))
  OR (OLD.status='approved' AND NEW.status NOT IN ('consuming','canceled','expired'))
  OR (OLD.status='consuming' AND NEW.status <> 'consumed') OR OLD.status IN ('consumed','canceled','expired')
BEGIN SELECT RAISE(ABORT,'MIGRATION_REQUEST_STATE'); END;

CREATE TRIGGER firebase_requests_no_consumed_delete BEFORE DELETE ON firebase_migration_requests WHEN OLD.status IN ('consuming','consumed')
BEGIN SELECT RAISE(ABORT,'MIGRATION_HISTORY_REQUIRED'); END;

CREATE TRIGGER firebase_requests_pending_insert BEFORE INSERT ON firebase_migration_requests WHEN NEW.status <> 'pending'
BEGIN SELECT RAISE(ABORT,'MIGRATION_REQUEST_STATE'); END;

CREATE TRIGGER google_cross_provider_slot BEFORE UPDATE OF status ON google_migration_requests
WHEN NEW.purpose='legacy_enrollment' AND NEW.status IN ('approved','consuming','consumed')
BEGIN SELECT (CASE WHEN EXISTS(SELECT 1 FROM firebase_migration_requests WHERE approved_household_id=NEW.approved_household_id AND (legacy_slot=NEW.legacy_slot OR approved_default_person=NEW.approved_default_person) AND purpose='legacy_enrollment' AND status IN ('approved','consuming','consumed')) THEN RAISE(ABORT,'MIGRATION_SLOT_RESERVED') END); END;

CREATE TRIGGER firebase_cross_provider_slot BEFORE UPDATE OF status ON firebase_migration_requests
WHEN NEW.purpose='legacy_enrollment' AND NEW.status IN ('approved','consuming','consumed')
BEGIN SELECT (CASE WHEN EXISTS(SELECT 1 FROM google_migration_requests WHERE approved_household_id=NEW.approved_household_id AND (legacy_slot=NEW.legacy_slot OR approved_default_person=NEW.approved_default_person) AND purpose='legacy_enrollment' AND status IN ('approved','consuming','consumed')) THEN RAISE(ABORT,'MIGRATION_SLOT_RESERVED') END); END;

CREATE TABLE sessions_new (
  token TEXT PRIMARY KEY CHECK (length(token) = 64),
  person TEXT CHECK (person IN ('husband', 'wife')),
  auth_method TEXT NOT NULL CHECK (auth_method IN ('password', 'passkey', 'google', 'firebase')),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
, household_id TEXT NOT NULL REFERENCES households(id), user_id TEXT REFERENCES users(id), membership_id TEXT, session_epoch INTEGER, oauth_attempt_sequence INTEGER REFERENCES oauth_login_attempts(sequence), firebase_identity_id TEXT, firebase_auth_time INTEGER, FOREIGN KEY(firebase_identity_id,user_id) REFERENCES firebase_identities(id,user_id), FOREIGN KEY(membership_id,user_id,household_id) REFERENCES household_memberships(id,user_id,household_id), CHECK((auth_method IN ('password','passkey') AND user_id IS NULL AND membership_id IS NULL AND session_epoch IS NULL AND oauth_attempt_sequence IS NULL AND firebase_identity_id IS NULL AND firebase_auth_time IS NULL) OR (auth_method='google' AND user_id IS NOT NULL AND membership_id IS NOT NULL AND session_epoch IS NOT NULL AND typeof(session_epoch)='integer' AND session_epoch BETWEEN 0 AND 9007199254740991 AND oauth_attempt_sequence IS NOT NULL AND firebase_identity_id IS NULL AND firebase_auth_time IS NULL) OR (auth_method='firebase' AND user_id IS NOT NULL AND membership_id IS NOT NULL AND session_epoch IS NOT NULL AND typeof(session_epoch)='integer' AND session_epoch BETWEEN 0 AND 9007199254740991 AND oauth_attempt_sequence IS NULL AND firebase_identity_id IS NOT NULL AND firebase_auth_time IS NOT NULL AND typeof(firebase_auth_time)='integer' AND firebase_auth_time BETWEEN 0 AND 9007199254740991)));

INSERT INTO sessions_new (token,person,auth_method,expires_at,created_at,household_id,user_id,membership_id,session_epoch,oauth_attempt_sequence) SELECT token,person,auth_method,expires_at,created_at,household_id,user_id,membership_id,session_epoch,oauth_attempt_sequence FROM sessions;

INSERT INTO _firebase_migration_assert SELECT CASE WHEN (SELECT COUNT(*) FROM sessions)=(SELECT COUNT(*) FROM sessions_new) AND NOT EXISTS(SELECT token,person,auth_method,expires_at,created_at,household_id,user_id,membership_id,session_epoch,oauth_attempt_sequence FROM sessions EXCEPT SELECT token,person,auth_method,expires_at,created_at,household_id,user_id,membership_id,session_epoch,oauth_attempt_sequence FROM sessions_new) AND NOT EXISTS(SELECT token,person,auth_method,expires_at,created_at,household_id,user_id,membership_id,session_epoch,oauth_attempt_sequence FROM sessions_new EXCEPT SELECT token,person,auth_method,expires_at,created_at,household_id,user_id,membership_id,session_epoch,oauth_attempt_sequence FROM sessions) THEN 1 ELSE 0 END;

CREATE TABLE payment_operations_new (
 id TEXT NOT NULL, month TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('record','correct','void')),
 expected_revision INTEGER NOT NULL CHECK(typeof(expected_revision) = 'integer' AND expected_revision BETWEEN 0 AND 9007199254740990),
 input_json TEXT NOT NULL CHECK(json_valid(input_json)), result_json TEXT NOT NULL CHECK(json_valid(result_json)),
 actor_person TEXT CHECK(actor_person IN ('husband','wife')), actor_auth_method TEXT NOT NULL CHECK(actor_auth_method IN ('password','passkey','google','firebase')), created_at TEXT NOT NULL
, household_id TEXT NOT NULL REFERENCES households(id),
 actor_user_id TEXT REFERENCES users(id),
 PRIMARY KEY(household_id,id),
 CHECK((actor_auth_method IN ('google','firebase') AND actor_user_id IS NOT NULL) OR (actor_auth_method IN ('password','passkey') AND actor_user_id IS NULL)));

INSERT INTO payment_operations_new (id,month,kind,expected_revision,input_json,result_json,actor_person,actor_auth_method,created_at,household_id,actor_user_id) SELECT id,month,kind,expected_revision,input_json,result_json,actor_person,actor_auth_method,created_at,household_id,actor_user_id FROM payment_operations;

INSERT INTO _firebase_migration_assert SELECT CASE WHEN (SELECT COUNT(*) FROM payment_operations)=(SELECT COUNT(*) FROM payment_operations_new) AND NOT EXISTS(SELECT id,month,kind,expected_revision,input_json,result_json,actor_person,actor_auth_method,created_at,household_id,actor_user_id FROM payment_operations EXCEPT SELECT id,month,kind,expected_revision,input_json,result_json,actor_person,actor_auth_method,created_at,household_id,actor_user_id FROM payment_operations_new) AND NOT EXISTS(SELECT id,month,kind,expected_revision,input_json,result_json,actor_person,actor_auth_method,created_at,household_id,actor_user_id FROM payment_operations_new EXCEPT SELECT id,month,kind,expected_revision,input_json,result_json,actor_person,actor_auth_method,created_at,household_id,actor_user_id FROM payment_operations) THEN 1 ELSE 0 END;

CREATE TABLE payment_records_new (
 id TEXT PRIMARY KEY, operation_id TEXT NOT NULL, month TEXT NOT NULL,
 signed_yen INTEGER NOT NULL CHECK(typeof(signed_yen) = 'integer' AND signed_yen != 0 AND signed_yen BETWEEN -9007199254740991 AND 9007199254740991),
 paid_on TEXT NOT NULL CHECK(length(paid_on) = 10 AND date(paid_on, '+0 days') IS paid_on), created_at TEXT NOT NULL,
 snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json)), calculation_version TEXT NOT NULL, rounding_version TEXT NOT NULL
, household_id TEXT NOT NULL REFERENCES households(id),
 UNIQUE(household_id,id), UNIQUE(household_id,operation_id), FOREIGN KEY(household_id,operation_id) REFERENCES payment_operations_new(household_id,id)
);

INSERT INTO payment_records_new (id,operation_id,month,signed_yen,paid_on,created_at,snapshot_json,calculation_version,rounding_version,household_id) SELECT id,operation_id,month,signed_yen,paid_on,created_at,snapshot_json,calculation_version,rounding_version,household_id FROM payment_records;

INSERT INTO _firebase_migration_assert SELECT CASE WHEN (SELECT COUNT(*) FROM payment_records)=(SELECT COUNT(*) FROM payment_records_new) AND NOT EXISTS(SELECT id,operation_id,month,signed_yen,paid_on,created_at,snapshot_json,calculation_version,rounding_version,household_id FROM payment_records EXCEPT SELECT id,operation_id,month,signed_yen,paid_on,created_at,snapshot_json,calculation_version,rounding_version,household_id FROM payment_records_new) AND NOT EXISTS(SELECT id,operation_id,month,signed_yen,paid_on,created_at,snapshot_json,calculation_version,rounding_version,household_id FROM payment_records_new EXCEPT SELECT id,operation_id,month,signed_yen,paid_on,created_at,snapshot_json,calculation_version,rounding_version,household_id FROM payment_records) THEN 1 ELSE 0 END;

CREATE TABLE payment_voids_new (
 id TEXT PRIMARY KEY, operation_id TEXT NOT NULL, payment_id TEXT NOT NULL,
 reason TEXT NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 500), created_at TEXT NOT NULL
, household_id TEXT NOT NULL REFERENCES households(id),
 UNIQUE(household_id,operation_id), UNIQUE(household_id,payment_id), FOREIGN KEY(household_id,operation_id) REFERENCES payment_operations_new(household_id,id), FOREIGN KEY(household_id,payment_id) REFERENCES payment_records_new(household_id,id)
);

INSERT INTO payment_voids_new (id,operation_id,payment_id,reason,created_at,household_id) SELECT id,operation_id,payment_id,reason,created_at,household_id FROM payment_voids;

INSERT INTO _firebase_migration_assert SELECT CASE WHEN (SELECT COUNT(*) FROM payment_voids)=(SELECT COUNT(*) FROM payment_voids_new) AND NOT EXISTS(SELECT id,operation_id,payment_id,reason,created_at,household_id FROM payment_voids EXCEPT SELECT id,operation_id,payment_id,reason,created_at,household_id FROM payment_voids_new) AND NOT EXISTS(SELECT id,operation_id,payment_id,reason,created_at,household_id FROM payment_voids_new EXCEPT SELECT id,operation_id,payment_id,reason,created_at,household_id FROM payment_voids) THEN 1 ELSE 0 END;

DROP TRIGGER households_legacy_stop_sessions;

DROP TABLE payment_voids;

DROP TABLE payment_records;

DROP TABLE payment_operations;

DROP TABLE sessions;

ALTER TABLE sessions_new RENAME TO sessions;

ALTER TABLE payment_operations_new RENAME TO payment_operations;

ALTER TABLE payment_records_new RENAME TO payment_records;

ALTER TABLE payment_voids_new RENAME TO payment_voids;

CREATE INDEX idx_payment_operations_household_month ON payment_operations(household_id,month);

CREATE INDEX idx_payment_records_household_month ON payment_records(household_id,month);

CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);

CREATE UNIQUE INDEX idx_sessions_oauth_attempt ON sessions(oauth_attempt_sequence) WHERE auth_method='google';

CREATE INDEX idx_sessions_user ON sessions(user_id);

CREATE TRIGGER households_legacy_stop_sessions AFTER UPDATE OF legacy_auth_disabled_at ON households
WHEN OLD.legacy_auth_disabled_at IS NULL AND NEW.legacy_auth_disabled_at IS NOT NULL
BEGIN DELETE FROM sessions WHERE household_id=NEW.id AND auth_method IN ('password','passkey'); END;

CREATE TRIGGER payment_operation_revision BEFORE INSERT ON payment_operations BEGIN
 SELECT (CASE WHEN COALESCE((SELECT revision FROM month_payment_revisions WHERE household_id = NEW.household_id AND month = NEW.month),0) != NEW.expected_revision THEN RAISE(ABORT,'PAYMENT_REVISION_CONFLICT') END);
END;

CREATE TRIGGER payment_operations_immutable_delete BEFORE DELETE ON payment_operations BEGIN SELECT RAISE(ABORT,'PAYMENT_IMMUTABLE'); END;

CREATE TRIGGER payment_operations_immutable_update BEFORE UPDATE ON payment_operations BEGIN SELECT RAISE(ABORT,'PAYMENT_IMMUTABLE'); END;

CREATE TRIGGER payment_record_operation BEFORE INSERT ON payment_records BEGIN
 SELECT (CASE WHEN NOT EXISTS(SELECT 1 FROM payment_operations WHERE household_id = NEW.household_id AND id = NEW.operation_id AND month = NEW.month AND kind IN ('record','correct')) THEN RAISE(ABORT,'PAYMENT_OPERATION_INVALID') END);
END;

CREATE TRIGGER payment_records_immutable_delete BEFORE DELETE ON payment_records BEGIN SELECT RAISE(ABORT,'PAYMENT_IMMUTABLE'); END;

CREATE TRIGGER payment_records_immutable_update BEFORE UPDATE ON payment_records BEGIN SELECT RAISE(ABORT,'PAYMENT_IMMUTABLE'); END;

CREATE TRIGGER payment_void_operation BEFORE INSERT ON payment_voids BEGIN
 SELECT (CASE WHEN NOT EXISTS(SELECT 1 FROM payment_operations o JOIN payment_records p ON p.household_id = o.household_id AND p.month = o.month WHERE o.household_id = NEW.household_id AND o.id = NEW.operation_id AND p.id = NEW.payment_id AND o.kind IN ('correct','void')) THEN RAISE(ABORT,'PAYMENT_OPERATION_INVALID') END);
END;

CREATE TRIGGER payment_voids_immutable_delete BEFORE DELETE ON payment_voids BEGIN SELECT RAISE(ABORT,'PAYMENT_IMMUTABLE'); END;

CREATE TRIGGER payment_voids_immutable_update BEFORE UPDATE ON payment_voids BEGIN SELECT RAISE(ABORT,'PAYMENT_IMMUTABLE'); END;

CREATE TRIGGER sessions_auth_immutable BEFORE UPDATE ON sessions
WHEN NEW.firebase_identity_id IS NOT OLD.firebase_identity_id OR NEW.firebase_auth_time IS NOT OLD.firebase_auth_time OR NEW.token IS NOT OLD.token OR NEW.user_id IS NOT OLD.user_id OR NEW.membership_id IS NOT OLD.membership_id OR NEW.household_id IS NOT OLD.household_id OR NEW.auth_method IS NOT OLD.auth_method OR NEW.session_epoch IS NOT OLD.session_epoch OR NEW.oauth_attempt_sequence IS NOT OLD.oauth_attempt_sequence
BEGIN SELECT RAISE(ABORT,'SESSION_AUTH_IMMUTABLE'); END;

CREATE TRIGGER sessions_google_insert BEFORE INSERT ON sessions WHEN NEW.auth_method='google'
BEGIN
  SELECT (CASE WHEN NOT EXISTS(
    SELECT 1 FROM users u
    JOIN household_memberships m ON m.user_id=u.id AND m.id=NEW.membership_id AND m.household_id=NEW.household_id
    JOIN google_identities i ON i.user_id=u.id AND i.revoked_at IS NULL
    JOIN oauth_login_attempts a ON a.sequence=NEW.oauth_attempt_sequence AND a.verified_issuer=i.issuer AND a.verified_subject=i.subject
    WHERE u.id=NEW.user_id AND u.active=1 AND u.session_epoch=NEW.session_epoch AND m.revoked_at IS NULL
      AND a.status='completed' AND a.claim_id IS NOT NULL AND a.sequence>u.oauth_attempt_floor
      AND julianday(a.expires_at)>julianday(NEW.created_at) AND julianday(a.expires_at)>julianday('now')
      AND julianday(NEW.expires_at)>julianday(NEW.created_at)
  ) THEN RAISE(ABORT,'GOOGLE_SESSION_INVALID') END);
END;

CREATE TRIGGER sessions_household_insert BEFORE INSERT ON sessions WHEN NEW.household_id IS NULL BEGIN SELECT RAISE(ABORT,'HOUSEHOLD_REQUIRED'); END;

CREATE TRIGGER sessions_household_update BEFORE UPDATE ON sessions WHEN (NEW.household_id IS NULL) OR OLD.household_id IS NOT NEW.household_id BEGIN SELECT RAISE(ABORT,'HOUSEHOLD_IMMUTABLE'); END;

CREATE TRIGGER sessions_legacy_insert BEFORE INSERT ON sessions
WHEN NEW.auth_method IN ('password','passkey') AND EXISTS(SELECT 1 FROM households WHERE id=NEW.household_id AND legacy_auth_disabled_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'LEGACY_AUTH_DISABLED'); END;

CREATE TRIGGER sessions_legacy_update BEFORE UPDATE ON sessions
WHEN NEW.auth_method IN ('password','passkey') AND EXISTS(SELECT 1 FROM households WHERE id=NEW.household_id AND legacy_auth_disabled_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'LEGACY_AUTH_DISABLED'); END;

CREATE TRIGGER sessions_firebase_insert BEFORE INSERT ON sessions WHEN NEW.auth_method='firebase'
BEGIN SELECT (CASE WHEN NOT EXISTS(
 SELECT 1 FROM users u JOIN firebase_identities i ON i.user_id=u.id AND i.id=NEW.firebase_identity_id AND i.revoked_at IS NULL
 JOIN household_memberships m ON m.user_id=u.id AND m.id=NEW.membership_id AND m.household_id=NEW.household_id AND m.revoked_at IS NULL
 WHERE u.id=NEW.user_id AND u.active=1 AND u.session_epoch=NEW.session_epoch AND NEW.firebase_auth_time>u.firebase_auth_time_floor
 AND NEW.firebase_auth_time<=CAST(strftime('%s','now') AS INTEGER)
 AND (SELECT COUNT(*) FROM household_memberships WHERE user_id=u.id AND revoked_at IS NULL)=1
 AND julianday(NEW.expires_at)>julianday(NEW.created_at) AND julianday(NEW.expires_at)<=julianday(NEW.created_at,'+1 hour') AND julianday(NEW.expires_at)>julianday('now')
) THEN RAISE(ABORT,'FIREBASE_SESSION_INVALID') END); END;
CREATE TRIGGER sessions_firebase_lifetime BEFORE UPDATE ON sessions WHEN OLD.auth_method='firebase' AND
 (NEW.created_at IS NOT OLD.created_at OR julianday(NEW.expires_at) IS NULL OR julianday(NEW.expires_at)>julianday(OLD.expires_at))
BEGIN SELECT RAISE(ABORT,'FIREBASE_SESSION_LIFETIME'); END;
INSERT INTO _firebase_migration_assert SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM pragma_foreign_key_check) THEN 1 ELSE 0 END;
DROP TABLE _firebase_migration_assert;
