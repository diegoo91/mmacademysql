// 0002_add_users_nickname — nickname + phone login index (MySQL path).
// Mirrors server/migrations/20261006_add_users_nickname.sql (PostgreSQL boot
// migration in src/index.js). Runtime DB is decided by DB_ENABLED/DB_BACKEND;
// both paths must know about the column.

export async function up(knex) {
  const hasNickname = await knex.schema.hasColumn('users', 'nickname')
  if (!hasNickname) {
    await knex.schema.alterTable('users', (t) => t.string('nickname', 30).nullable())
  }
  // blanks → NULL so the unique index never collides on empty strings
  await knex.raw("UPDATE `users` SET `nickname` = NULLIF(TRIM(`nickname`), '') WHERE `nickname` IS NOT NULL")
  await knex.raw('CREATE INDEX `ix_users_phone` ON `users` (`phone`)')
  // unique among non-null, case-insensitive
  const [rows] = await knex.raw(
    "SELECT COLUMN_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND INDEX_NAME = 'uq_users_nickname'"
  )
  if (rows.length === 0) {
    // MySQL default collations are case-insensitive, so a plain unique
    // index already enforces nickname uniqueness case-insensitively.
    await knex.raw('CREATE UNIQUE INDEX `uq_users_nickname` ON `users` (`nickname`)')
  }
  // players VIEW (0001) exposes explicit columns — add nickname for parity
  await knex.raw('DROP VIEW IF EXISTS `players`')
  await knex.raw(`
    CREATE OR REPLACE VIEW \`players\` AS
    SELECT \`user_id\` AS \`id\`, \`user_id\`, \`uuid\`, \`user_code\`, \`name\`,
           \`nickname\`,
           \`name\` AS \`full_name\`, \`email\`, \`phone\`, \`dob\`, \`skill_level\`,
           \`position\`, \`notes\`, \`private_balance\`, \`group_balance\`,
           \`balance_zero_since\`, \`member_code\`, \`member_since\`,
           \`is_claimed\`, \`created_at\`, \`updated_at\`
    FROM \`users\` WHERE \`role\` = 'player'
  `)
}

export async function down(knex) {
  await knex.raw('DROP VIEW IF EXISTS `players`')
  for (const ix of ['uq_users_nickname', 'ix_users_phone']) {
    const [rows] = await knex.raw(
      "SELECT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND INDEX_NAME = ?",
      [ix]
    )
    if (rows.length > 0) await knex.raw(`DROP INDEX \`${ix}\` ON \`users\``)
  }
  if (await knex.schema.hasColumn('users', 'nickname')) {
    await knex.schema.alterTable('users', (t) => t.dropColumn('nickname'))
  }
  await knex.raw(`
    CREATE OR REPLACE VIEW \`players\` AS
    SELECT \`user_id\` AS \`id\`, \`user_id\`, \`uuid\`, \`user_code\`, \`name\`,
           \`name\` AS \`full_name\`, \`email\`, \`phone\`, \`dob\`, \`skill_level\`,
           \`position\`, \`notes\`, \`private_balance\`, \`group_balance\`,
           \`balance_zero_since\`, \`member_code\`, \`member_since\`,
           \`is_claimed\`, \`created_at\`, \`updated_at\`
    FROM \`users\` WHERE \`role\` = 'player'
  `)
}
