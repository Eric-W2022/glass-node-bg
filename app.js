const express = require('express');
const cors = require('cors');
const axios = require('axios');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

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

app.listen(PORT, () => {
  console.log(`服务器运行在端口 ${PORT}`);
  console.log(`微信登录接口: POST http://localhost:${PORT}/api/wechat/login`);
});

module.exports = app;
