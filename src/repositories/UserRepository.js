const { query, transaction } = require('../config/database');
const User = require('../models/User');

class UserRepository {
  // 根据openid查找用户
  static async findByOpenid(openid) {
    const sql = 'SELECT * FROM user WHERE openid = ?';
    const users = await query(sql, [openid]);
    return users.length > 0 ? User.fromDbData(users[0]) : null;
  }

  // 根据unionid查找用户
  static async findByUnionid(unionid) {
    const sql = 'SELECT * FROM user WHERE unionid = ?';
    const users = await query(sql, [unionid]);
    return users.length > 0 ? User.fromDbData(users[0]) : null;
  }

  // 创建用户
  static async create(userData) {
    const user = new User(userData);
    const dbData = user.toDbFormat();
    
    const sql = `
      INSERT INTO user (
        openid, nickname, avatar_url, gender, country, province, city, 
        language, create_time, update_time, last_login_time, session_key, unionid
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), NOW(), ?, ?)
    `;
    
    const result = await query(sql, [
      dbData.openid, dbData.nickname, dbData.avatar_url, dbData.gender,
      dbData.country, dbData.province, dbData.city, dbData.language,
      dbData.session_key, dbData.unionid
    ]);
    
    return result.insertId;
  }

  // 更新用户信息
  static async update(openid, updateData) {
    const fields = [];
    const values = [];
    
    Object.keys(updateData).forEach(key => {
      if (updateData[key] !== undefined) {
        fields.push(`${key} = ?`);
        values.push(updateData[key]);
      }
    });
    
    if (fields.length === 0) return false;
    
    values.push(openid);
    const sql = `UPDATE user SET ${fields.join(', ')}, update_time = NOW() WHERE openid = ?`;
    
    const result = await query(sql, values);
    return result.affectedRows > 0;
  }

  // 更新最后登录时间
  static async updateLastLoginTime(openid) {
    const sql = 'UPDATE user SET last_login_time = NOW(), update_time = NOW() WHERE openid = ?';
    const result = await query(sql, [openid]);
    return result.affectedRows > 0;
  }

  // 创建或更新用户（微信登录专用）
  static async createOrUpdateWechatUser(wechatData) {
    const { openid, unionid = null, session_key = null } = wechatData;

    return await transaction(async (connection) => {
      // 先尝试根据openid查找用户
      let user = await this.findByOpenid(openid);
      
      if (user) {
        // 用户存在，更新session_key和最后登录时间
        await connection.execute(
          'UPDATE user SET session_key = ?, last_login_time = NOW(), update_time = NOW() WHERE openid = ?',
          [session_key, openid]
        );
        user.session_key = session_key;
        user.last_login_time = new Date();
      } else {
        // 用户不存在，创建新用户
        const userId = await connection.execute(
          'INSERT INTO user (openid, unionid, session_key, create_time, update_time, last_login_time) VALUES (?, ?, ?, NOW(), NOW(), NOW())',
          [openid, unionid, session_key]
        );
        user = new User({
          openid,
          unionid,
          session_key,
          last_login_time: new Date()
        });
      }
      
      return user;
    });
  }

  // 更新用户详细信息（解密后的用户信息）
  static async updateUserInfo(openid, userInfo) {
    const {
      nickname,
      avatar_url,
      gender,
      city,
      province,
      country,
      language
    } = userInfo;

    return await this.update(openid, {
      nickname,
      avatar_url,
      gender,
      city,
      province,
      country,
      language
    });
  }

  // 获取所有用户
  static async findAll(limit = 100, offset = 0) {
    const sql = 'SELECT * FROM user ORDER BY create_time DESC LIMIT ? OFFSET ?';
    const users = await query(sql, [limit, offset]);
    return users.map(user => User.fromDbData(user));
  }

  // 删除用户
  static async delete(openid) {
    const sql = 'DELETE FROM user WHERE openid = ?';
    const result = await query(sql, [openid]);
    return result.affectedRows > 0;
  }
}

module.exports = UserRepository;
