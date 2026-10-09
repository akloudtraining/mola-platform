import {sqliteTable,text,integer,index,uniqueIndex} from 'drizzle-orm/sqlite-core';
export const organizations=sqliteTable('organizations',{id:text('id').primaryKey(),owner:text('owner').notNull(),data:text('data').notNull(),version:integer('version').notNull().default(1)},t=>[index('idx_organizations_owner').on(t.owner)]);
export const entries=sqliteTable('entries',{id:text('id').primaryKey(),orgId:text('org_id').notNull(),data:text('data').notNull(),created:text('created').notNull()},t=>[index('idx_entries_org').on(t.orgId)]);

export const installation=sqliteTable('installation',{id:text('id').primaryKey(),owner:text('owner').notNull()});
export const notificationReads=sqliteTable('notification_reads',{id:text('id').primaryKey(),userId:text('user_id').notNull(),orgId:text('org_id').notNull(),eventId:text('event_id').notNull(),readAt:text('read_at').notNull()},t=>[index('idx_notification_reads_user_org').on(t.userId,t.orgId)]);

// Disposable test records are stored separately from the live ledger.
export const testWorkspace=sqliteTable('test_workspace',{id:text('id').primaryKey(),session:text('session').notNull(),owner:text('owner').notNull(),created:text('created').notNull()});
export const testOrganizations=sqliteTable('test_organizations',{id:text('id').primaryKey(),workspaceId:text('workspace_id').notNull().references(()=>testWorkspace.id,{onDelete:'cascade'}),owner:text('owner').notNull(),data:text('data').notNull(),version:integer('version').notNull().default(1)});
export const testEntries=sqliteTable('test_entries',{id:text('id').primaryKey(),orgId:text('org_id').notNull().references(()=>testOrganizations.id,{onDelete:'cascade'}),data:text('data').notNull(),created:text('created').notNull()},t=>[index('idx_test_entries_org').on(t.orgId)]);
export const testNotificationReads=sqliteTable('test_notification_reads',{id:text('id').primaryKey(),userId:text('user_id').notNull(),orgId:text('org_id').notNull().references(()=>testOrganizations.id,{onDelete:'cascade'}),eventId:text('event_id').notNull(),readAt:text('read_at').notNull()},t=>[index('idx_test_reads_user_org').on(t.userId,t.orgId)]);

// Cloudflare-native Better Auth records. These tables are additive: they do not
// replace or rewrite the Mola ledger, member records, or historical audit data.
const authDate=(name:string)=>integer(name,{mode:'timestamp_ms'});
export const user=sqliteTable('user',{
 id:text('id').primaryKey(),name:text('name').notNull(),email:text('email').notNull(),emailVerified:integer('email_verified',{mode:'boolean'}).notNull().default(false),image:text('image'),createdAt:authDate('created_at').notNull(),updatedAt:authDate('updated_at').notNull()
},t=>[uniqueIndex('idx_auth_user_email').on(t.email)]);
export const session=sqliteTable('session',{
 id:text('id').primaryKey(),expiresAt:authDate('expires_at').notNull(),token:text('token').notNull(),createdAt:authDate('created_at').notNull(),updatedAt:authDate('updated_at').notNull(),ipAddress:text('ip_address'),userAgent:text('user_agent'),userId:text('user_id').notNull().references(()=>user.id,{onDelete:'cascade'})
},t=>[uniqueIndex('idx_auth_session_token').on(t.token),index('idx_auth_session_user').on(t.userId)]);
export const account=sqliteTable('account',{
 id:text('id').primaryKey(),accountId:text('account_id').notNull(),providerId:text('provider_id').notNull(),userId:text('user_id').notNull().references(()=>user.id,{onDelete:'cascade'}),accessToken:text('access_token'),refreshToken:text('refresh_token'),idToken:text('id_token'),accessTokenExpiresAt:authDate('access_token_expires_at'),refreshTokenExpiresAt:authDate('refresh_token_expires_at'),scope:text('scope'),password:text('password'),createdAt:authDate('created_at').notNull(),updatedAt:authDate('updated_at').notNull()
},t=>[index('idx_auth_account_user').on(t.userId)]);
export const verification=sqliteTable('verification',{
 id:text('id').primaryKey(),identifier:text('identifier').notNull(),value:text('value').notNull(),expiresAt:authDate('expires_at').notNull(),createdAt:authDate('created_at'),updatedAt:authDate('updated_at')
},t=>[index('idx_auth_verification_identifier').on(t.identifier)]);
export const authIdentityLinks=sqliteTable('auth_identity_links',{
 id:text('id').primaryKey(),legacyUserId:text('legacy_user_id').notNull(),authUserId:text('auth_user_id').notNull(),email:text('email').notNull(),linkedAt:text('linked_at').notNull(),purpose:text('purpose').notNull()
},t=>[uniqueIndex('idx_auth_identity_legacy').on(t.legacyUserId),uniqueIndex('idx_auth_identity_user').on(t.authUserId)]);
