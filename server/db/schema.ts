import { sql } from 'drizzle-orm'
import {
  bigserial,
  boolean,
  check,
  doublePrecision,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import type { InstantRunoffResult } from '../../domain/index.js'

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
}

// ---------------------------------------------------------------------------
// Better Auth tables. Field names follow Better Auth's core schema; the
// drizzle adapter maps them by property name.
// ---------------------------------------------------------------------------

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  ...timestamps,
})

export const session = pgTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    token: text('token').notNull().unique(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    ...timestamps,
  },
  (t) => [index('session_user_id_idx').on(t.userId)],
)

export const account = pgTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
    scope: text('scope'),
    password: text('password'),
    ...timestamps,
  },
  (t) => [index('account_user_id_idx').on(t.userId)],
)

export const verification = pgTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (t) => [index('verification_identifier_idx').on(t.identifier)],
)

// ---------------------------------------------------------------------------
// Better Auth plugin tables: jwt (signing keys) and the MCP plugin's OAuth
// provider (clients, tokens, consents), which let a member's own agent act
// as them over MCP. Generated from the plugins' own schema (getAuthTables),
// so field names match what Better Auth reads and writes.
// ---------------------------------------------------------------------------

export const jwks = pgTable('jwks', {
  id: text('id').primaryKey(),
  publicKey: text('public_key').notNull(),
  privateKey: text('private_key').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  alg: text('alg'),
  crv: text('crv'),
})

export const oauthClient = pgTable(
  'oauth_client',
  {
    id: text('id').primaryKey(),
    clientId: text('client_id').notNull().unique(),
    clientSecret: text('client_secret'),
    clientDiscoveryId: text('client_discovery_id'),
    disabled: boolean('disabled').default(false),
    skipConsent: boolean('skip_consent'),
    enableEndSession: boolean('enable_end_session'),
    subjectType: text('subject_type'),
    scopes: text('scopes').array(),
    clientCredentialsScopes: text('client_credentials_scopes')
      .array()
      .default(sql`'{}'::text[]`),
    userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }),
    name: text('name'),
    uri: text('uri'),
    icon: text('icon'),
    contacts: text('contacts').array(),
    tos: text('tos'),
    policy: text('policy'),
    softwareId: text('software_id'),
    softwareVersion: text('software_version'),
    softwareStatement: text('software_statement'),
    redirectUris: text('redirect_uris').array().notNull(),
    postLogoutRedirectUris: text('post_logout_redirect_uris').array(),
    backchannelLogoutUri: text('backchannel_logout_uri'),
    backchannelLogoutSessionRequired: boolean('backchannel_logout_session_required'),
    tokenEndpointAuthMethod: text('token_endpoint_auth_method'),
    applicationType: text('application_type'),
    jwks: text('jwks'),
    jwksUri: text('jwks_uri'),
    grantTypes: text('grant_types').array(),
    responseTypes: text('response_types').array(),
    requirePKCE: boolean('require_pkce'),
    dpopBoundAccessTokens: boolean('dpop_bound_access_tokens').default(false),
    referenceId: text('reference_id'),
    metadata: jsonb('metadata'),
  },
  (t) => [index('oauth_client_user_id_idx').on(t.userId)],
)

export const oauthResource = pgTable('oauth_resource', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull().unique(),
  name: text('name').notNull(),
  accessTokenTtl: integer('access_token_ttl'),
  refreshTokenTtl: integer('refresh_token_ttl'),
  signingAlgorithm: text('signing_algorithm'),
  signingKeyId: text('signing_key_id'),
  allowedScopes: text('allowed_scopes').array(),
  customClaims: jsonb('custom_claims'),
  dpopBoundAccessTokensRequired: boolean('dpop_bound_access_tokens_required').default(false),
  disabled: boolean('disabled').default(false),
  createdAt: timestamp('created_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }),
  policyVersion: integer('policy_version').default(1),
  metadata: jsonb('metadata'),
})

export const oauthClientResource = pgTable(
  'oauth_client_resource',
  {
    id: text('id').primaryKey(),
    clientId: text('client_id')
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: 'cascade' }),
    resourceId: text('resource_id')
      .notNull()
      .references(() => oauthResource.identifier, { onDelete: 'cascade' }),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }),
  },
  (t) => [
    index('oauth_client_resource_client_id_idx').on(t.clientId),
    index('oauth_client_resource_resource_id_idx').on(t.resourceId),
    uniqueIndex('oauth_client_resource_client_id_resource_id_idx').on(t.clientId, t.resourceId),
  ],
)

export const oauthRefreshToken = pgTable(
  'oauth_refresh_token',
  {
    id: text('id').primaryKey(),
    token: text('token').notNull().unique(),
    clientId: text('client_id')
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: 'cascade' }),
    sessionId: text('session_id').references(() => session.id, { onDelete: 'set null' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    referenceId: text('reference_id'),
    authorizationCodeId: text('authorization_code_id'),
    resources: text('resources').array(),
    requestedUserInfoClaims: text('requested_user_info_claims').array(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }),
    revoked: timestamp('revoked', { withTimezone: true }),
    rotatedAt: timestamp('rotated_at', { withTimezone: true }),
    rotationReplayResponse: text('rotation_replay_response'),
    rotationReplayExpiresAt: timestamp('rotation_replay_expires_at', { withTimezone: true }),
    authTime: timestamp('auth_time', { withTimezone: true }),
    confirmation: jsonb('confirmation'),
    scopes: text('scopes').array().notNull(),
  },
  (t) => [
    index('oauth_refresh_token_client_id_idx').on(t.clientId),
    index('oauth_refresh_token_session_id_idx').on(t.sessionId),
    index('oauth_refresh_token_user_id_idx').on(t.userId),
    index('oauth_refresh_token_authorization_code_id_idx').on(t.authorizationCodeId),
  ],
)

export const oauthAccessToken = pgTable(
  'oauth_access_token',
  {
    id: text('id').primaryKey(),
    token: text('token').unique(),
    clientId: text('client_id')
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: 'cascade' }),
    sessionId: text('session_id').references(() => session.id, { onDelete: 'set null' }),
    userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
    referenceId: text('reference_id'),
    authorizationCodeId: text('authorization_code_id'),
    resources: text('resources').array(),
    requestedUserInfoClaims: text('requested_user_info_claims').array(),
    refreshId: text('refresh_id').references(() => oauthRefreshToken.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }),
    revoked: timestamp('revoked', { withTimezone: true }),
    confirmation: jsonb('confirmation'),
    scopes: text('scopes').array().notNull(),
  },
  (t) => [
    index('oauth_access_token_client_id_idx').on(t.clientId),
    index('oauth_access_token_session_id_idx').on(t.sessionId),
    index('oauth_access_token_user_id_idx').on(t.userId),
    index('oauth_access_token_authorization_code_id_idx').on(t.authorizationCodeId),
    index('oauth_access_token_refresh_id_idx').on(t.refreshId),
  ],
)

export const oauthConsent = pgTable(
  'oauth_consent',
  {
    id: text('id').primaryKey(),
    clientId: text('client_id')
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: 'cascade' }),
    userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
    referenceId: text('reference_id'),
    resources: text('resources').array(),
    requestedUserInfoClaims: text('requested_user_info_claims').array(),
    scopes: text('scopes').array().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }),
  },
  (t) => [index('oauth_consent_client_id_idx').on(t.clientId), index('oauth_consent_user_id_idx').on(t.userId)],
)

export const oauthClientAssertion = pgTable('oauth_client_assertion', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
})

// ---------------------------------------------------------------------------
// App tables. Private constraints, cached travel times and the audit log come
// later; for now a meetup has members, their starts, a shortlist and a vote.
// ---------------------------------------------------------------------------

export const memberRole = pgEnum('member_role', ['organizer', 'member'])

/** planning: shortlist open. voting: ballots open, shortlist frozen. decided: result stored. */
export const meetupPhase = pgEnum('meetup_phase', ['planning', 'voting', 'decided'])

export const meetup = pgTable('meetup', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  organizerId: text('organizer_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  phase: meetupPhase('phase').notNull().default('planning'),
  votingDeadline: timestamp('voting_deadline', { withTimezone: true }),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  /** The instant-runoff count, kept once voting closes so the reveal never changes. */
  result: jsonb('result').$type<InstantRunoffResult>(),
  /**
   * How many places are on the shortlist. Every add and removal updates this
   * row, so they queue behind each other and behind opening voting, and the
   * cap and the two-place minimum are checked against the latest count.
   */
  shortlistCount: integer('shortlist_count').notNull().default(0),
  ...timestamps,
})

export const meetupMember = pgTable(
  'meetup_member',
  {
    meetupId: uuid('meetup_id')
      .notNull()
      .references(() => meetup.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    role: memberRole('role').notNull().default('member'),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
    // Where this member starts from and how far they'll go. Null until they say.
    // The town's name and coordinates are copied in, so a data refresh can't move anyone.
    startTownId: integer('start_town_id'),
    startLabel: text('start_label'),
    startLat: doublePrecision('start_lat'),
    startLng: doublePrecision('start_lng'),
    maxMinutes: integer('max_minutes'),
    /**
     * The lease on this member's check-in: who holds it (a token per turn)
     * and when it was last renewed. A running turn renews it often; one left
     * unrenewed (a crashed function) can be taken over after a few minutes.
     * Only the holder of the matching token renews, saves or clears it.
     */
    checkinBusySince: timestamp('checkin_busy_since', { withTimezone: true }),
    checkinClaim: uuid('checkin_claim'),
  },
  (t) => [
    primaryKey({ columns: [t.meetupId, t.userId] }),
    index('meetup_member_user_id_idx').on(t.userId),
    // A start is all five fields or none, so no write path can leave half of one.
    check(
      'meetup_member_start_complete',
      sql`num_nonnulls(${t.startTownId}, ${t.startLabel}, ${t.startLat}, ${t.startLng}, ${t.maxMinutes}) in (0, 5)`,
    ),
  ],
)

/** Places the group will vote on. Candidate order for tie-breaks is the order items were added. */
export const shortlistItem = pgTable(
  'shortlist_item',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    meetupId: uuid('meetup_id')
      .notNull()
      .references(() => meetup.id, { onDelete: 'cascade' }),
    // Copied in from the town list, like a member's start.
    townId: integer('town_id').notNull(),
    label: text('label').notNull(),
    lat: doublePrecision('lat').notNull(),
    lng: doublePrecision('lng').notNull(),
    note: text('note'),
    addedBy: text('added_by').references(() => user.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('shortlist_item_meetup_town_uq').on(t.meetupId, t.townId)],
)

// Who voted and what was voted live apart, with nothing to join them on. A
// receipt says a member voted (for turnout and one vote each). A ballot holds a
// ranking and the hash of a token only its voter was given, so they can change
// it before voting closes. Neither has a timestamp. Whoever runs the database
// could still try to correlate them; the app itself can't.

export const ballotReceipt = pgTable(
  'ballot_receipt',
  {
    meetupId: uuid('meetup_id')
      .notNull()
      .references(() => meetup.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.meetupId, t.userId] })],
)

export const ballot = pgTable(
  'ballot',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    meetupId: uuid('meetup_id')
      .notNull()
      .references(() => meetup.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    /** Shortlist item ids, best first. */
    ranking: jsonb('ranking').$type<string[]>().notNull(),
  },
  (t) => [unique('ballot_meetup_token_uq').on(t.meetupId, t.tokenHash)],
)

// ---------------------------------------------------------------------------
// The private check-in: each member's conversation with the planner agent and
// the things they told it. Both are keyed to one member in one meetup and only
// ever read back for that member.
// ---------------------------------------------------------------------------

export const checkinRole = pgEnum('checkin_role', ['user', 'assistant'])

/**
 * One message of a member's check-in, stored exactly as sent to or received
 * from the model so the conversation replays unchanged (the model's thinking
 * blocks must come back byte for byte). `visible` marks messages shown in the
 * chat; tool results and tool-only turns are kept but not shown.
 */
export const checkinMessage = pgTable(
  'checkin_message',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    meetupId: uuid('meetup_id').notNull(),
    userId: text('user_id').notNull(),
    role: checkinRole('role').notNull(),
    content: jsonb('content').$type<unknown[]>().notNull(),
    /** What the chat shows for this message, or null to hide it. */
    text: text('text'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.meetupId, t.userId],
      foreignColumns: [meetupMember.meetupId, meetupMember.userId],
      name: 'checkin_message_member_fk',
    }).onDelete('cascade'),
    index('checkin_message_member_idx').on(t.meetupId, t.userId, t.id),
  ],
)

export const constraintKind = pgEnum('constraint_kind', [
  'budget',
  'food',
  'accessibility',
  'timing',
  'travel',
  'other',
])

/** Something a member told the planner in private, like a budget or a food need. */
export const memberConstraint = pgTable(
  'member_constraint',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    meetupId: uuid('meetup_id').notNull(),
    userId: text('user_id').notNull(),
    kind: constraintKind('kind').notNull(),
    detail: text('detail').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.meetupId, t.userId],
      foreignColumns: [meetupMember.meetupId, meetupMember.userId],
      name: 'member_constraint_member_fk',
    }).onDelete('cascade'),
    index('member_constraint_member_idx').on(t.meetupId, t.userId),
  ],
)
