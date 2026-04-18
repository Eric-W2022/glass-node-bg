const { query } = require('../config/database');
const Device = require('../models/Device');

class DeviceRepository {
  static async findByDeviceId(deviceId) {
    const sql = 'SELECT * FROM devices WHERE device_id = ? AND deleted_at IS NULL';
    const rows = await query(sql, [deviceId]);
    return rows.length > 0 ? Device.fromDbData(rows[0]) : null;
  }

  static async create(deviceData) {
    const device = new Device(deviceData);
    const dbData = device.toDbFormat();

    const sql = `
      INSERT INTO devices (device_id, warning_distance_cm, reminder_mode)
      VALUES (?, ?, ?)
    `;

    await query(sql, [
      dbData.device_id,
      dbData.warning_distance_cm,
      dbData.reminder_mode
    ]);

    return dbData.device_id;
  }

  static async update(deviceId, updateData) {
    const allowed = ['warning_distance_cm', 'reminder_mode'];
    const fields = [];
    const values = [];

    allowed.forEach((key) => {
      if (updateData[key] !== undefined) {
        fields.push(`${key} = ?`);
        values.push(updateData[key]);
      }
    });

    if (fields.length === 0) return false;

    values.push(deviceId);
    const sql = `UPDATE devices SET ${fields.join(', ')} WHERE device_id = ? AND deleted_at IS NULL`;

    const result = await query(sql, values);
    return result.affectedRows > 0;
  }

  /** 存在则更新，不存在则插入 */
  static async upsert(deviceData) {
    const device = new Device(deviceData);
    const dbData = device.toDbFormat();

    const sql = `
      INSERT INTO devices (device_id, warning_distance_cm, reminder_mode)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE
        warning_distance_cm = VALUES(warning_distance_cm),
        reminder_mode = VALUES(reminder_mode),
        deleted_at = NULL
    `;

    await query(sql, [
      dbData.device_id,
      dbData.warning_distance_cm,
      dbData.reminder_mode
    ]);

    return dbData.device_id;
  }

  static async findAll(limit = 100, offset = 0) {
    const sql = `SELECT * FROM devices WHERE deleted_at IS NULL ORDER BY updated_at DESC LIMIT ${Number(limit)} OFFSET ${Number(offset)}`;
    const rows = await query(sql, []);
    return rows.map((row) => Device.fromDbData(row));
  }

  static async softDelete(deviceId) {
    const sql =
      'UPDATE devices SET deleted_at = NOW() WHERE device_id = ? AND deleted_at IS NULL';
    const result = await query(sql, [deviceId]);
    return result.affectedRows > 0;
  }

  static async delete(deviceId) {
    const sql = 'DELETE FROM devices WHERE device_id = ?';
    const result = await query(sql, [deviceId]);
    return result.affectedRows > 0;
  }
}

module.exports = DeviceRepository;
