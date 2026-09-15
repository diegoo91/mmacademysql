// 0001_initial_schema — corrected relational schema for mmacademy.
// Decisions locked in:
//   users PK = user_id (API aliases to `id`), keep uuid/user_code/created_by/updated_by
//   no players TABLE — VIEW players over users (option B, history lives in slots)
//   notifications.is_read, audit_logs.rec_before (code matches DB)
//   slots.player_text only (player_name_1/_2 merged at load, not created)
//   results/comments/conversion_requests get FULL columns (old ddl had shells)
//   money DECIMAL(10,2), dates DATE, timestamps DATETIME(3), snapshots JSON
//   FKs: SET NULL (history survives deletes), CASCADE only for
//   notifications.user_id + slots.booking_id. Users self-FKs omitted
//   (first-user bootstrap would deadlock); wrapper populates audit cols.

export async function up(knex) {
  // Clean up legacy artifacts if an older ddl.sql was ever applied
  await knex.raw('DROP VIEW IF EXISTS `players`')
  await knex.raw('DROP TABLE IF EXISTS `players`')

  // ---- users (no self-FKs — bootstrap safe) ----
  await knex.schema.createTable('users', (t) => {
    t.increments('user_id').primary()
    t.string('uuid', 36).notNullable().defaultTo(knex.raw('(UUID())'))
    t.string('user_code', 6).nullable().unique()
    t.string('name', 191).nullable()
    t.string('email', 191).nullable().unique()
    t.string('phone', 32).nullable()
    t.date('dob').nullable()
    t.string('password_hash', 255).nullable()
    t.string('role', 32).nullable().index()
    t.string('skill_level', 32).nullable()
    t.string('member_since', 8).nullable()
    t.tinyint('force_password_change', 1).nullable().defaultTo(1)
    t.string('member_code', 16).nullable().unique()
    t.tinyint('is_claimed', 1).nullable()
    t.integer('private_balance').nullable().defaultTo(0)
    t.integer('group_balance').nullable().defaultTo(0)
    t.datetime('balance_zero_since', { precision: 3 }).nullable()
    t.text('notes').nullable()
    t.string('position', 64).nullable()
    t.json('permissions').nullable()
    t.string('avatar', 255).nullable()
    t.datetime('created_at', { precision: 3 }).nullable()
    t.datetime('updated_at', { precision: 3 }).nullable()
    t.integer('created_by').nullable()
    t.integer('updated_by').nullable()
  })

  // ---- import_batches (before bookings/results that reference it) ----
  await knex.schema.createTable('import_batches', (t) => {
    t.increments('id').primary()
    t.string('kind', 32).nullable()
    t.string('filename', 255).nullable()
    t.integer('row_count').nullable()
    t.integer('error_count').nullable()
    t.integer('by_user').nullable().references('user_id').inTable('users').onDelete('SET NULL')
    t.string('status', 32).nullable()
    t.datetime('created_at', { precision: 3 }).nullable()
    t.datetime('updated_at', { precision: 3 }).nullable()
    t.integer('created_by').nullable().references('user_id').inTable('users').onDelete('SET NULL')
    t.integer('updated_by').nullable().references('user_id').inTable('users').onDelete('SET NULL')
  })

  // ---- bookings ----
  await knex.schema.createTable('bookings', (t) => {
    t.increments('id').primary()
    t.string('ref', 64).nullable().unique()
    t.integer('user_id').nullable().references('user_id').inTable('users').onDelete('SET NULL').index()
    t.string('session_type', 16).nullable()
    t.string('mode', 16).nullable()
    t.json('sessions_json').nullable()
    t.text('sessions').nullable()
    t.decimal('total', 10, 2).nullable()
    t.string('status', 32).nullable().index()
    t.string('player_name', 191).nullable()
    t.integer('private_remaining').nullable()
    t.integer('group_remaining').nullable()
    t.string('deducted_from', 64).nullable()
    t.integer('deducted_count').nullable()
    t.tinyint('paid', 1).nullable()
    t.decimal('amount_paid', 10, 2).nullable()
    t.string('payment_method', 32).nullable()
    t.date('payment_date').nullable()
    t.integer('import_batch').nullable().references('id').inTable('import_batches').onDelete('SET NULL')
    t.datetime('created_at', { precision: 3 }).nullable()
    t.datetime('updated_at', { precision: 3 }).nullable()
    t.integer('created_by').nullable().references('user_id').inTable('users').onDelete('SET NULL')
    t.integer('updated_by').nullable().references('user_id').inTable('users').onDelete('SET NULL')
  })

  // ---- slots ----
  await knex.schema.createTable('slots', (t) => {
    t.increments('id').primary()
    t.date('date').nullable().index()
    t.string('time', 16).nullable()
    t.integer('court').nullable()
    t.text('player_text').nullable()
    t.integer('booking_id').nullable().references('id').inTable('bookings').onDelete('CASCADE').index()
    t.integer('user_id').nullable().references('user_id').inTable('users').onDelete('SET NULL').index()
    t.integer('coach_id').nullable().references('user_id').inTable('users').onDelete('SET NULL')
    t.string('session_type', 16).nullable()
    t.string('status', 32).nullable()
    t.datetime('created_at', { precision: 3 }).nullable()
    t.datetime('updated_at', { precision: 3 }).nullable()
    t.integer('created_by').nullable().references('user_id').inTable('users').onDelete('SET NULL')
    t.integer('updated_by').nullable().references('user_id').inTable('users').onDelete('SET NULL')
    t.unique(['date', 'time', 'court'])
  })

  // ---- payments ----
  await knex.schema.createTable('payments', (t) => {
    t.increments('id').primary()
    t.string('ref', 32).nullable().unique()
    t.date('date').nullable()
    t.string('player_name', 191).nullable()
    t.integer('player_id').nullable().references('user_id').inTable('users').onDelete('SET NULL').index()
    t.string('method', 32).nullable()
    t.decimal('amount', 10, 2).nullable()
    t.integer('private_sessions').nullable().defaultTo(0)
    t.integer('group_sessions').nullable().defaultTo(0)
    t.text('notes').nullable()
    t.string('status', 32).nullable().index()
    t.integer('booking_id').nullable().references('id').inTable('bookings').onDelete('SET NULL').index()
    t.integer('created_by').nullable().references('user_id').inTable('users').onDelete('SET NULL')
    t.datetime('created_at', { precision: 3 }).nullable()
    t.datetime('updated_at', { precision: 3 }).nullable()
    t.integer('updated_by').nullable().references('user_id').inTable('users').onDelete('SET NULL')
  })

  // ---- booking_requests ----
  await knex.schema.createTable('booking_requests', (t) => {
    t.increments('id').primary()
    t.string('kind', 32).nullable()
    t.integer('slot_id').nullable().references('id').inTable('slots').onDelete('SET NULL')
    t.integer('booking_id').nullable().references('id').inTable('bookings').onDelete('SET NULL')
    t.integer('player_id').nullable().references('user_id').inTable('users').onDelete('SET NULL').index()
    t.string('player_name', 191).nullable()
    t.json('payload').nullable()
    t.string('status', 32).nullable().index()
    t.integer('decided_by').nullable().references('user_id').inTable('users').onDelete('SET NULL')
    t.datetime('decided_at', { precision: 3 }).nullable()
    t.datetime('created_at', { precision: 3 }).nullable()
    t.datetime('updated_at', { precision: 3 }).nullable()
    t.integer('created_by').nullable().references('user_id').inTable('users').onDelete('SET NULL')
    t.integer('updated_by').nullable().references('user_id').inTable('users').onDelete('SET NULL')
  })

  // ---- comments (full columns — old ddl had a shell) ----
  await knex.schema.createTable('comments', (t) => {
    t.increments('id').primary()
    t.integer('user_id').nullable().references('user_id').inTable('users').onDelete('SET NULL')
    t.string('user_name', 191).nullable()
    t.text('text').nullable()
    t.tinyint('rating').nullable()
    t.string('status', 32).nullable().index()
    t.datetime('created_at', { precision: 3 }).nullable()
    t.datetime('updated_at', { precision: 3 }).nullable()
    t.integer('created_by').nullable().references('user_id').inTable('users').onDelete('SET NULL')
    t.integer('updated_by').nullable().references('user_id').inTable('users').onDelete('SET NULL')
  })

  // ---- notifications ----
  await knex.schema.createTable('notifications', (t) => {
    t.increments('id').primary()
    t.integer('user_id').notNullable().references('user_id').inTable('users').onDelete('CASCADE').index()
    t.string('kind', 64).nullable()
    t.string('title', 255).nullable()
    t.text('body').nullable()
    t.string('link', 255).nullable()
    t.tinyint('is_read', 1).nullable().defaultTo(0)
    t.datetime('created_at', { precision: 3 }).nullable()
    t.datetime('updated_at', { precision: 3 }).nullable()
    t.integer('created_by').nullable().references('user_id').inTable('users').onDelete('SET NULL')
    t.integer('updated_by').nullable().references('user_id').inTable('users').onDelete('SET NULL')
  })

  // ---- conversion_requests (full columns — old ddl had a shell) ----
  await knex.schema.createTable('conversion_requests', (t) => {
    t.increments('id').primary()
    t.integer('user_id').nullable().references('user_id').inTable('users').onDelete('SET NULL')
    t.string('user_name', 191).nullable()
    t.string('from', 32).nullable()
    t.string('to', 32).nullable()
    t.integer('count').nullable()
    t.string('status', 32).nullable().index()
    t.datetime('created_at', { precision: 3 }).nullable()
    t.datetime('updated_at', { precision: 3 }).nullable()
    t.integer('created_by').nullable().references('user_id').inTable('users').onDelete('SET NULL')
    t.integer('updated_by').nullable().references('user_id').inTable('users').onDelete('SET NULL')
  })

  // ---- expenses ----
  await knex.schema.createTable('expenses', (t) => {
    t.increments('id').primary()
    t.date('date').nullable().index()
    t.string('category', 64).nullable()
    t.text('description').nullable()
    t.decimal('amount', 10, 2).nullable()
    t.integer('created_by').nullable().references('user_id').inTable('users').onDelete('SET NULL')
    t.datetime('created_at', { precision: 3 }).nullable()
    t.datetime('updated_at', { precision: 3 }).nullable()
    t.integer('updated_by').nullable().references('user_id').inTable('users').onDelete('SET NULL')
  })

  // ---- results (full columns — old ddl had a shell) ----
  await knex.schema.createTable('results', (t) => {
    t.increments('id').primary()
    t.date('date').nullable().index()
    t.string('format', 32).nullable()
    t.json('sideA').nullable()
    t.json('sideB').nullable()
    t.text('side_a').nullable()
    t.text('side_b').nullable()
    t.string('player_a', 191).nullable()
    t.string('player_b', 191).nullable()
    t.integer('score_a').nullable()
    t.integer('score_b').nullable()
    t.string('score_text', 32).nullable()
    t.string('winner_side', 4).nullable()
    t.string('winner', 191).nullable()
    t.string('status', 32).nullable().index()
    t.integer('submitted_by').nullable().references('user_id').inTable('users').onDelete('SET NULL')
    t.integer('court').nullable()
    t.string('court_time', 128).nullable()
    t.string('competition', 128).nullable()
    t.text('notes').nullable()
    t.integer('import_batch').nullable().references('id').inTable('import_batches').onDelete('SET NULL')
    t.datetime('created_at', { precision: 3 }).nullable()
    t.datetime('updated_at', { precision: 3 }).nullable()
    t.integer('created_by').nullable().references('user_id').inTable('users').onDelete('SET NULL')
    t.integer('updated_by').nullable().references('user_id').inTable('users').onDelete('SET NULL')
  })

  // ---- audit_logs (append-only; rec_before avoids reserved `before`) ----
  await knex.schema.createTable('audit_logs', (t) => {
    t.increments('id').primary()
    t.datetime('timestamp', { precision: 3 }).nullable()
    t.integer('actor_id').nullable().references('user_id').inTable('users').onDelete('SET NULL').index()
    t.string('actor_name', 191).nullable()
    t.string('actor_role', 64).nullable()
    t.string('ip', 64).nullable()
    t.string('action', 128).nullable().index()
    t.string('target_type', 64).nullable()
    t.string('target_id', 128).nullable()
    t.text('rec_before', 'longtext').nullable()
    t.text('after', 'longtext').nullable()
    t.datetime('created_at', { precision: 3 }).nullable()
    t.datetime('updated_at', { precision: 3 }).nullable()
    t.integer('created_by').nullable().references('user_id').inTable('users').onDelete('SET NULL')
    t.integer('updated_by').nullable().references('user_id').inTable('users').onDelete('SET NULL')
  })

  // ---- court_defaults ----
  await knex.schema.createTable('court_defaults', (t) => {
    t.increments('id').primary()
    t.integer('court').nullable().unique()
    t.integer('coach_id').nullable().references('user_id').inTable('users').onDelete('SET NULL')
    t.datetime('created_at', { precision: 3 }).nullable()
    t.datetime('updated_at', { precision: 3 }).nullable()
    t.integer('created_by').nullable().references('user_id').inTable('users').onDelete('SET NULL')
    t.integer('updated_by').nullable().references('user_id').inTable('users').onDelete('SET NULL')
  })

  // ---- players VIEW (option B): history comes from slots, not this view ----
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

export async function down(knex) {
  await knex.raw('DROP VIEW IF EXISTS `players`')
  for (const tbl of ['court_defaults', 'audit_logs', 'results', 'expenses',
    'conversion_requests', 'notifications', 'comments', 'booking_requests',
    'payments', 'slots', 'bookings', 'import_batches', 'users']) {
    await knex.schema.dropTableIfExists(tbl)
  }
}
