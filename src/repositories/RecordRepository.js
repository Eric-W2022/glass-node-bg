const { query, transaction } = require('../config/database');
const Record = require('../models/Record');
const { v4: uuidv4 } = require('uuid');

class RecordRepository {
  // 根据openid查找记录
  static async findByOpenid(openid) {
    const sql = 'SELECT * FROM records WHERE openid = ? AND deleted_at IS NULL';
    const records = await query(sql, [openid]);
    return records.length > 0 ? Record.fromDbData(records[0]) : null;
  }

  // 根据id查找记录
  static async findById(id) {
    const sql = 'SELECT * FROM records WHERE id = ? AND deleted_at IS NULL';
    const records = await query(sql, [id]);
    return records.length > 0 ? Record.fromDbData(records[0]) : null;
  }

  // 创建记录
  static async create(recordData) {
    const record = new Record({
      ...recordData,
      id: uuidv4()
    });
    const dbData = record.toDbFormat();
    
    const sql = `
      INSERT INTO records (id, openid, count, created_at, updated_at) 
      VALUES (?, ?, ?, NOW(), NOW())
    `;
    
    const result = await query(sql, [
      dbData.id, dbData.openid, dbData.count
    ]);
    
    return result.insertId;
  }

  // 更新记录
  static async update(id, updateData) {
    const fields = [];
    const values = [];
    
    Object.keys(updateData).forEach(key => {
      if (updateData[key] !== undefined) {
        fields.push(`${key} = ?`);
        values.push(updateData[key]);
      }
    });
    
    if (fields.length === 0) return false;
    
    values.push(id);
    const sql = `UPDATE records SET ${fields.join(', ')}, updated_at = NOW() WHERE id = ? AND deleted_at IS NULL`;
    
    const result = await query(sql, values);
    return result.affectedRows > 0;
  }

  // 增加计数
  static async incrementCount(openid, increment = 1) {
    const sql = `
      INSERT INTO records (id, openid, count, created_at, updated_at) 
      VALUES (?, ?, ?, NOW(), NOW())
      ON DUPLICATE KEY UPDATE 
      count = count + ?, 
      updated_at = NOW()
    `;
    
    const id = uuidv4();
    const result = await query(sql, [id, openid, increment, increment]);
    return result.affectedRows > 0;
  }

  // 减少计数
  static async decrementCount(openid, decrement = 1) {
    const sql = `
      UPDATE records 
      SET count = GREATEST(0, count - ?), updated_at = NOW() 
      WHERE openid = ? AND deleted_at IS NULL
    `;
    
    const result = await query(sql, [decrement, openid]);
    return result.affectedRows > 0;
  }

  // 设置计数
  static async setCount(openid, count) {
    const sql = `
      INSERT INTO records (id, openid, count, created_at, updated_at) 
      VALUES (?, ?, ?, NOW(), NOW())
      ON DUPLICATE KEY UPDATE 
      count = ?, 
      updated_at = NOW()
    `;
    
    const id = uuidv4();
    const result = await query(sql, [id, openid, count, count]);
    return result.affectedRows > 0;
  }

  // 获取所有记录
  static async findAll(limit = 100, offset = 0) {
    const sql = 'SELECT * FROM records WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT ? OFFSET ?';
    const records = await query(sql, [parseInt(limit), parseInt(offset)]);
    return records.map(record => Record.fromDbData(record));
  }

  // 根据openid获取记录列表
  static async findByOpenidList(openid, limit = 100, offset = 0) {
    const sql = 'SELECT * FROM records WHERE openid = ? AND deleted_at IS NULL ORDER BY created_at DESC LIMIT ? OFFSET ?';
    const records = await query(sql, [openid, parseInt(limit), parseInt(offset)]);
    return records.map(record => Record.fromDbData(record));
  }

  // 软删除记录
  static async softDelete(id) {
    const sql = 'UPDATE records SET deleted_at = NOW(), updated_at = NOW() WHERE id = ? AND deleted_at IS NULL';
    const result = await query(sql, [id]);
    return result.affectedRows > 0;
  }

  // 硬删除记录
  static async delete(id) {
    const sql = 'DELETE FROM records WHERE id = ?';
    const result = await query(sql, [id]);
    return result.affectedRows > 0;
  }

  // 获取记录统计
  static async getStats(openid) {
    const sql = `
      SELECT 
        COUNT(*) as total_records,
        SUM(count) as total_count,
        AVG(count) as avg_count,
        MAX(count) as max_count,
        MIN(count) as min_count
      FROM records 
      WHERE openid = ? AND deleted_at IS NULL
    `;
    
    const stats = await query(sql, [openid]);
    return stats.length > 0 ? stats[0] : null;
  }
}

module.exports = RecordRepository;
