-- Additive DNP multiplayer tables. Safe to run on databases without these tables.
CREATE TABLE IF NOT EXISTS `openclaw_dnp_rooms` (
  `id` VARCHAR(36) NOT NULL,
  `code` VARCHAR(6) NOT NULL,
  `mode` VARCHAR(20) NOT NULL,
  `status` VARCHAR(20) NOT NULL DEFAULT 'lobby',
  `admin_player_id` VARCHAR(36) NULL,
  `score_left` INTEGER NOT NULL DEFAULT 0,
  `score_right` INTEGER NOT NULL DEFAULT 0,
  `ball_x` DOUBLE NOT NULL DEFAULT 0.5,
  `ball_y` DOUBLE NOT NULL DEFAULT 0.5,
  `ball_vx` DOUBLE NOT NULL DEFAULT 0.42,
  `ball_vy` DOUBLE NOT NULL DEFAULT 0.17,
  `version` INTEGER NOT NULL DEFAULT 1,
  `last_tick_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `openclaw_dnp_rooms_code_key` (`code`),
  INDEX `openclaw_dnp_rooms_status_updated_at_idx` (`status`, `updated_at`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `openclaw_dnp_players` (
  `id` VARCHAR(36) NOT NULL,
  `room_id` VARCHAR(36) NOT NULL,
  `name` VARCHAR(16) NOT NULL,
  `join_order` INTEGER NOT NULL,
  `slot_index` INTEGER NOT NULL,
  `token_hash` VARCHAR(64) NOT NULL,
  `input_position` DOUBLE NOT NULL DEFAULT 0.5,
  `input_seq` INTEGER NOT NULL DEFAULT 0,
  `last_seen_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `left_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `openclaw_dnp_players_room_id_join_order_key` (`room_id`, `join_order`),
  UNIQUE INDEX `openclaw_dnp_players_room_id_token_hash_key` (`room_id`, `token_hash`),
  INDEX `openclaw_dnp_players_room_id_left_at_idx` (`room_id`, `left_at`),
  CONSTRAINT `openclaw_dnp_players_room_id_fkey` FOREIGN KEY (`room_id`) REFERENCES `openclaw_dnp_rooms`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
