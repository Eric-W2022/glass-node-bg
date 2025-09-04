const express = require('express');
const cors = require('cors');
const axios = require('axios');
const crypto = require('crypto');
const UserRepository = require('./src/repositories/UserRepository');
const RecordRepository = require('./src/repositories/RecordRepository');
const { testConnection } = require('./src/config/database');

const app = express();
const PORT = process.env.PORT || 9000;

// 中间件配置
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 微信小程序配置
const WECHAT_APPID = process.env.WECHAT_APPID || 'wx8c0384130a03beaf';
const WECHAT_SECRET = process.env.WECHAT_SECRET || '7fb4e763c02c1ce75dc919a30f0c8544';

// 微信小程序登录接口
app.post('/api/wechat/login', async (req, res) => {
  try {
    const { code } = req.body;
    
    if (!code) {
      return res.status(400).json({
        success: false,
        message: '缺少code参数'
      });
    }

    // 调用微信接口获取session_key和openid
    const wechatUrl = `https://api.weixin.qq.com/sns/jscode2session?appid=${WECHAT_APPID}&secret=${WECHAT_SECRET}&js_code=${code}&grant_type=authorization_code`;
    
    const response = await axios.get(wechatUrl);
    const { openid, session_key, unionid, errcode, errmsg } = response.data;

    if (errcode) {
      let errorMessage = errmsg;
      let statusCode = 400;
      
      // 根据微信官方错误码处理
      switch (errcode) {
        case 40029:
          errorMessage = 'code无效，请重新获取';
          break;
        case 45011:
          errorMessage = 'API调用太频繁，请稍候再试';
          statusCode = 429;
          break;
        case 40226:
          errorMessage = '高风险等级用户，登录被拦截';
          break;
        case -1:
          errorMessage = '系统繁忙，请稍候再试';
          statusCode = 500;
          break;
        default:
          errorMessage = `微信登录失败: ${errmsg}`;
      }
      
      return res.status(statusCode).json({
        success: false,
        message: errorMessage,
        errorCode: errcode,
        errorMsg: errmsg
      });
    }

    // 查询数据库中是否存在该用户
    let user = await UserRepository.findByOpenid(openid);
    
    if (!user) {
      // 用户不存在，创建新用户（只填openid）
      const userId = await UserRepository.create({
        openid: openid,
        unionid: unionid || null,
        session_key: session_key
      });
      console.log(`新用户创建成功，ID: ${userId}, openid: ${openid}`);
    } else {
      // 用户存在，更新session_key
      await UserRepository.update(openid, {
        session_key: session_key,
        unionid: unionid || user.unionid
      });
      console.log(`用户已存在，更新session_key，openid: ${openid}`);
    }

    res.json({
      success: true,
      message: '登录成功',
      data: {
        openid,
        session_key,
        unionid: unionid || null
      }
    });

  } catch (error) {
    console.error('微信登录错误:', error);
    res.status(500).json({
      success: false,
      message: '服务器内部错误',
      error: error.message
    });
  }
});


// 获取用户信息接口（需要解密微信加密数据）
app.post('/api/wechat/userinfo', (req, res) => {
  const { encryptedData, iv, sessionKey } = req.body;
  
  if (!encryptedData || !iv || !sessionKey) {
    return res.status(400).json({
      success: false,
      message: '缺少必要参数'
    });
  }

  try {
    // 解密微信加密数据
    const decipher = crypto.createDecipheriv('aes-128-cbc', Buffer.from(sessionKey, 'base64'), Buffer.from(iv, 'base64'));
    let decrypted = decipher.update(encryptedData, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    
    const userInfo = JSON.parse(decrypted);
    
    res.json({
      success: true,
      message: '获取用户信息成功',
      data: userInfo
    });
  } catch (error) {
    console.error('解密用户信息错误:', error);
    res.status(400).json({
      success: false,
      message: '解密用户信息失败',
      error: error.message
    });
  }
});

// 记录接口
app.post('/api/record', async (req, res) => {
  try {
    const { openid, count } = req.body;
    
    if (!openid) {
      return res.status(400).json({
        success: false,
        message: '缺少openid参数'
      });
    }
    
    if (count === undefined || count === null) {
      return res.status(400).json({
        success: false,
        message: '缺少count参数'
      });
    }

    // 检查用户是否存在
    const user = await UserRepository.findByOpenid(openid);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: '用户不存在，请先登录'
      });
    }

    // 查询是否已有记录
    let record = await RecordRepository.findByOpenid(openid);
    
    if (record) {
      // 更新现有记录
      await RecordRepository.update(record.id, { count: count });
      console.log(`记录更新成功，openid: ${openid}, count: ${count}`);
    } else {
      // 创建新记录
      const recordId = await RecordRepository.create({
        openid: openid,
        count: count
      });
      console.log(`记录创建成功，ID: ${recordId}, openid: ${openid}, count: ${count}`);
    }

    res.json({
      success: true,
      message: '记录保存成功',
      data: {
        openid,
        count
      }
    });

  } catch (error) {
    console.error('记录保存错误:', error);
    res.status(500).json({
      success: false,
      message: '服务器内部错误',
      error: error.message
    });
  }
});

// 查询记录接口
app.get('/api/records', async (req, res) => {
  try {
    const { openid, page = 1, limit = 50 } = req.query;
    
    // 验证分页参数
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    
    if (pageNum < 1 || limitNum < 1 || limitNum > 100) {
      return res.status(400).json({
        success: false,
        message: '分页参数无效，page必须>=1，limit必须在1-100之间'
      });
    }
    
    const offset = (pageNum - 1) * limitNum;
    
    let records;
    let totalCount = 0;
    
    if (openid) {
      // 查询指定用户的记录
      records = await RecordRepository.findByOpenidList(openid, limitNum, offset);
      // 获取该用户的总记录数
      const allRecords = await RecordRepository.findByOpenidList(openid, 10000, 0);
      totalCount = allRecords.length;
    } else {
      // 查询所有记录
      records = await RecordRepository.findAll(limitNum, offset);
      // 获取总记录数（这里简化处理，实际项目中应该有专门的count方法）
      const allRecords = await RecordRepository.findAll(10000, 0);
      totalCount = allRecords.length;
    }
    
    const totalPages = Math.ceil(totalCount / limitNum);
    
    res.json({
      success: true,
      message: '查询成功',
      data: {
        records: records,
        pagination: {
          currentPage: pageNum,
          totalPages: totalPages,
          totalCount: totalCount,
          limit: limitNum,
          hasNext: pageNum < totalPages,
          hasPrev: pageNum > 1
        }
      }
    });

  } catch (error) {
    console.error('查询记录错误:', error);
    res.status(500).json({
      success: false,
      message: '服务器内部错误',
      error: error.message
    });
  }
});

// 404处理
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: '接口不存在'
  });
});

// 错误处理中间件
app.use((err, req, res, next) => {
  console.error('服务器错误:', err);
  res.status(500).json({
    success: false,
    message: '服务器内部错误',
    error: process.env.NODE_ENV === 'development' ? err.message : '服务器错误'
  });
});

app.listen(PORT, async () => {
  console.log(`服务器运行在端口 ${PORT}`);
  console.log(`微信登录接口: POST http://localhost:${PORT}/api/wechat/login`);
  console.log(`记录接口: POST http://localhost:${PORT}/api/record`);
  console.log(`查询记录接口: GET http://localhost:${PORT}/api/records`);
  
  // 测试数据库连接
  await testConnection();
});

module.exports = app;
