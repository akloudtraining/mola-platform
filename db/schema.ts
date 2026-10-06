import {sqliteTable,text,integer,index} from 'drizzle-orm/sqlite-core';
export const organizations=sqliteTable('organizations',{id:text('id').primaryKey(),owner:text('owner').notNull(),data:text('data').notNull(),version:integer('version').notNull().default(1)},t=>[index('idx_organizations_owner').on(t.owner)]);
export const entries=sqliteTable('entries',{id:text('id').primaryKey(),orgId:text('org_id').notNull(),data:text('data').notNull(),created:text('created').notNull()},t=>[index('idx_entries_org').on(t.orgId)]);

export const installation=sqliteTable('installation',{id:text('id').primaryKey(),owner:text('owner').notNull()});
export const notificationReads=sqliteTable('notification_reads',{id:text('id').primaryKey(),userId:text('user_id').notNull(),orgId:text('org_id').notNull(),eventId:text('event_id').notNull(),readAt:text('read_at').notNull()},t=>[index('idx_notification_reads_user_org').on(t.userId,t.orgId)]);

// Disposable test records are stored separately from the live ledger.
export const testWorkspace=sqliteTable('test_workspace',{id:text('id').primaryKey(),session:text('session').notNull(),owner:text('owner').notNull(),created:text('created').notNull()});
export const testOrganizations=sqliteTable('test_organizations',{id:text('id').primaryKey(),workspaceId:text('workspace_id').notNull().references(()=>testWorkspace.id,{onDelete:'cascade'}),owner:text('owner').notNull(),data:text('data').notNull(),version:integer('version').notNull().default(1)});
export const testEntries=sqliteTable('test_entries',{id:text('id').primaryKey(),orgId:text('org_id').notNull().references(()=>testOrganizations.id,{onDelete:'cascade'}),data:text('data').notNull(),created:text('created').notNull()},t=>[index('idx_test_entries_org').on(t.orgId)]);
export const testNotificationReads=sqliteTable('test_notification_reads',{id:text('id').primaryKey(),userId:text('user_id').notNull(),orgId:text('org_id').notNull().references(()=>testOrganizations.id,{onDelete:'cascade'}),eventId:text('event_id').notNull(),readAt:text('read_at').notNull()},t=>[index('idx_test_reads_user_org').on(t.userId,t.orgId)]);
