-- 用户表增加积分字段（云端 MySQL 执行一次）
-- 若已存在 points 列会报错，请先确认或跳过

ALTER TABLE `user`
  ADD COLUMN `points` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '积分';
