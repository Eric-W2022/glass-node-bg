const mysql = require('mysql2/promise');
require('dotenv').config();

// 数据库配置
const dbConfig = {
  host: process.env.DB_HOST || 'gz-cdb-6kgcteld.sql.tencentcdb.com',
  port: process.env.DB_PORT || 63181,
  user: process.env.DB_USER || 'glass',
  password: process.env.DB_PASSWORD || 'STC89c51',
  database: process.env.DB_NAME || 'glass',
  charset: 'utf8mb4',
  timezone: '+08:00',
  acquireTimeout: 60000,
  timeout: 60000,
  reconnect: true,
  connectionLimit: 10,
  queueLimit: 0
};

// 创建连接池
const pool = mysql.createPool(dbConfig);

// 测试数据库连接
async function testConnection() {
  try {
    console.log('尝试连接数据库...', {
      host: dbConfig.host,
      port: dbConfig.port,
      user: dbConfig.user,
      database: dbConfig.database
    });
    const connection = await pool.getConnection();
    console.log('数据库连接成功');
    connection.release();
    return true;
  } catch (error) {
    console.error('数据库连接失败:', {
      message: error.message,
      code: error.code,
      errno: error.errno,
      host: dbConfig.host,
      port: dbConfig.port,
      user: dbConfig.user,
      database: dbConfig.database
    });
    return false;
  }
}

// 执行查询
async function query(sql, params = []) {
  try {
    const [rows] = await pool.execute(sql, params);
    return rows;
  } catch (error) {
    console.error('数据库查询错误:', error.message);
    throw error;
  }
}

// 执行事务
async function transaction(callback) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  pool,
  query,
  transaction,
  testConnection
};
