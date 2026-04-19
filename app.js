const express = require('express');
const cors = require('cors');
const axios = require('axios');
const crypto = require('crypto');
const UserRepository = require('./src/repositories/UserRepository');
const RecordRepository = require('./src/repositories/RecordRepository');
const DeviceRepository = require('./src/repositories/DeviceRepository');
const { testConnection } = require('./src/config/database');

function deviceToResponse(device) {
  if (!device) return null;
  return {
    device_id: device.device_id,
    warning_distance_cm: device.warning_distance_cm,
    reminder_mode: device.reminder_mode,
    created_at: device.created_at,
    updated_at: device.updated_at
  };
}

/** 0/1/2：2 表示两种提醒方式都开启 */
function isValidReminderMode(mode) {
  var m = Number(mode);
  return Number.isFinite(m) && Number.isInteger(m) && m >= 0 && m <= 2;
}

/** 返回给前端的用户信息（不含 session_key） */
function userToPublicResponse(user) {
  if (!user) return null;
  return {
    openid: user.openid,
    nickname: user.nickname,
    avatar_url: user.avatar_url,
    gender: user.gender,
    country: user.country,
    province: user.province,
    city: user.city,
    language: user.language,
    unionid: user.unionid,
    create_time: user.create_time,
    update_time: user.update_time,
    last_login_time: user.last_login_time
  };
}

const USER_UPDATABLE_FIELDS = [
  'nickname',
  'avatar_url',
  'gender',
  'country',
  'province',
  'city',
  'language'
];

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

// 通过 openid 更新用户资料（写入 user 表）
app.put('/api/wechat/user', async (req, res) => {
  try {
    const body = req.body || {};
    const openid = body.openid;

    if (!openid || !String(openid).trim()) {
      return res.status(400).json({
        success: false,
        message: '缺少 openid'
      });
    }

    const openidTrimmed = String(openid).trim();
    const existing = await UserRepository.findByOpenid(openidTrimmed);
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: '用户不存在，请先登录'
      });
    }

    const updateData = {};
    for (var i = 0; i < USER_UPDATABLE_FIELDS.length; i++) {
      var key = USER_UPDATABLE_FIELDS[i];
      if (body[key] !== undefined) {
        updateData[key] = body[key];
      }
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        message:
          '请至少提供一个可更新字段：nickname, avatar_url, gender, country, province, city, language'
      });
    }

    var changed = await UserRepository.update(openidTrimmed, updateData);
    var updated = await UserRepository.findByOpenid(openidTrimmed);

    res.json({
      success: true,
      message: changed ? '更新成功' : '未修改（与当前资料一致）',
      data: userToPublicResponse(updated)
    });
  } catch (error) {
    console.error('更新用户资料错误:', error);
    res.status(500).json({
      success: false,
      message: '服务器内部错误',
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

    // 总是创建新记录
    const recordId = await RecordRepository.create({
      openid: openid,
      count: count
    });
    console.log(`记录创建成功，ID: ${recordId}, openid: ${openid}, count: ${count}`);

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
    const { openid, page = 1, limit = 20 } = req.query;
    
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

// 设备列表（未软删）
app.get('/api/devices', async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);

    if (pageNum < 1 || limitNum < 1 || limitNum > 100) {
      return res.status(400).json({
        success: false,
        message: '分页参数无效，page必须>=1，limit必须在1-100之间'
      });
    }

    const offset = (pageNum - 1) * limitNum;
    const devices = await DeviceRepository.findAll(limitNum, offset);
    const allForCount = await DeviceRepository.findAll(10000, 0);
    const totalCount = allForCount.length;
    const totalPages = Math.ceil(totalCount / limitNum);

    res.json({
      success: true,
      message: '查询成功',
      data: {
        devices: devices.map(deviceToResponse),
        pagination: {
          currentPage: pageNum,
          totalPages,
          totalCount,
          limit: limitNum,
          hasNext: pageNum < totalPages,
          hasPrev: pageNum > 1
        }
      }
    });
  } catch (error) {
    console.error('查询设备列表错误:', error);
    res.status(500).json({
      success: false,
      message: '服务器内部错误',
      error: error.message
    });
  }
});

// 按设备 id 查询单条
app.get('/api/devices/:deviceId', async (req, res) => {
  try {
    const { deviceId } = req.params;
    if (!deviceId || !String(deviceId).trim()) {
      return res.status(400).json({
        success: false,
        message: '设备 id 无效'
      });
    }

    const device = await DeviceRepository.findByDeviceId(String(deviceId).trim());
    if (!device) {
      return res.status(404).json({
        success: false,
        message: '设备不存在或已删除'
      });
    }

    res.json({
      success: true,
      message: '查询成功',
      data: deviceToResponse(device)
    });
  } catch (error) {
    console.error('查询设备错误:', error);
    res.status(500).json({
      success: false,
      message: '服务器内部错误',
      error: error.message
    });
  }
});

// 添加设备
app.post('/api/devices', async (req, res) => {
  try {
    const { device_id, warning_distance_cm, reminder_mode = 0 } = req.body;

    if (!device_id || !String(device_id).trim()) {
      return res.status(400).json({
        success: false,
        message: '缺少 device_id 或为空'
      });
    }

    if (
      warning_distance_cm === undefined ||
      warning_distance_cm === null ||
      warning_distance_cm === ''
    ) {
      return res.status(400).json({
        success: false,
        message: '缺少 warning_distance_cm'
      });
    }

    const distance = Number(warning_distance_cm);
    if (!Number.isFinite(distance) || distance < 0 || !Number.isInteger(distance)) {
      return res.status(400).json({
        success: false,
        message: 'warning_distance_cm 须为非负整数（单位：厘米）'
      });
    }

    const mode = Number(reminder_mode);
    if (!isValidReminderMode(mode)) {
      return res.status(400).json({
        success: false,
        message: 'reminder_mode 只能为 0、1 或 2（2 表示两种提醒方式都开启）'
      });
    }

    try {
      await DeviceRepository.create({
        device_id: String(device_id).trim(),
        warning_distance_cm: distance,
        reminder_mode: mode
      });
    } catch (e) {
      if (e.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({
          success: false,
          message: '该设备 id 已存在'
        });
      }
      throw e;
    }

    const device = await DeviceRepository.findByDeviceId(String(device_id).trim());
    res.status(201).json({
      success: true,
      message: '设备添加成功',
      data: deviceToResponse(device)
    });
  } catch (error) {
    console.error('添加设备错误:', error);
    res.status(500).json({
      success: false,
      message: '服务器内部错误',
      error: error.message
    });
  }
});

// 按设备 id 更新信息
app.put('/api/devices/:deviceId', async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { warning_distance_cm, reminder_mode } = req.body;

    if (!deviceId || !String(deviceId).trim()) {
      return res.status(400).json({
        success: false,
        message: '设备 id 无效'
      });
    }

    if (
      warning_distance_cm === undefined &&
      reminder_mode === undefined
    ) {
      return res.status(400).json({
        success: false,
        message: '请至少提供 warning_distance_cm 或 reminder_mode 之一'
      });
    }

    const updateData = {};
    if (warning_distance_cm !== undefined) {
      const distance = Number(warning_distance_cm);
      if (!Number.isFinite(distance) || distance < 0 || !Number.isInteger(distance)) {
        return res.status(400).json({
          success: false,
          message: 'warning_distance_cm 须为非负整数（单位：厘米）'
        });
      }
      updateData.warning_distance_cm = distance;
    }
    if (reminder_mode !== undefined) {
      const mode = Number(reminder_mode);
      if (!isValidReminderMode(mode)) {
        return res.status(400).json({
          success: false,
          message: 'reminder_mode 只能为 0、1 或 2（2 表示两种提醒方式都开启）'
        });
      }
      updateData.reminder_mode = mode;
    }

    const id = String(deviceId).trim();
    const ok = await DeviceRepository.update(id, updateData);
    if (!ok) {
      return res.status(404).json({
        success: false,
        message: '设备不存在、已删除或未变更'
      });
    }

    const device = await DeviceRepository.findByDeviceId(id);
    res.json({
      success: true,
      message: '更新成功',
      data: deviceToResponse(device)
    });
  } catch (error) {
    console.error('更新设备错误:', error);
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
  console.log(`更新用户资料: PUT http://localhost:${PORT}/api/wechat/user`);
  console.log(`记录接口: POST http://localhost:${PORT}/api/record`);
  console.log(`查询记录接口: GET http://localhost:${PORT}/api/records`);
  console.log(`设备: GET http://localhost:${PORT}/api/devices | GET http://localhost:${PORT}/api/devices/:deviceId`);
  console.log(`设备: POST http://localhost:${PORT}/api/devices | PUT http://localhost:${PORT}/api/devices/:deviceId`);
  
  // 测试数据库连接
  const dbConnected = await testConnection();
  if (dbConnected) {
    console.log('✅ 数据库连接正常');
  } else {
    console.log('❌ 数据库连接失败');
  }
});

module.exports = app;
