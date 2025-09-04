# Glass Node Background

一个支持微信小程序登录的Express应用。

## 功能特性

- 微信小程序登录接口
- 用户信息解密
- Token验证
- 健康检查接口

## 安装依赖

```bash
npm install
```

## 环境配置

创建 `.env` 文件并配置以下环境变量：

```env
# 服务器配置
PORT=3000
NODE_ENV=development

# 微信小程序配置
WECHAT_APPID=wx8c0384130a03beaf
WECHAT_SECRET=7fb4e763c02c1ce75dc919a30f0c8544
```

## 运行应用

开发模式：
```bash
npm run dev
```

生产模式：
```bash
npm start
```

## API接口

### 1. 微信小程序登录

**POST** `/api/wechat/login`

请求参数：
```json
{
  "code": "微信小程序登录凭证"
}
```

响应：
```json
{
  "success": true,
  "message": "登录成功",
  "data": {
    "openid": "用户openid",
    "session_key": "会话密钥",
    "token": "自定义token"
  }
}
```

### 2. Token验证

**POST** `/api/wechat/verify`

请求参数：
```json
{
  "token": "用户token"
}
```

响应：
```json
{
  "success": true,
  "message": "Token验证成功",
  "data": {
    "valid": true
  }
}
```

### 3. 获取用户信息

**POST** `/api/wechat/userinfo`

请求参数：
```json
{
  "encryptedData": "加密的用户数据",
  "iv": "初始向量",
  "sessionKey": "会话密钥"
}
```

响应：
```json
{
  "success": true,
  "message": "获取用户信息成功",
  "data": {
    "openId": "用户openid",
    "nickName": "用户昵称",
    "gender": 1,
    "city": "城市",
    "province": "省份",
    "country": "国家",
    "avatarUrl": "头像URL"
  }
}
```

### 4. 健康检查

**GET** `/health`

响应：
```json
{
  "success": true,
  "message": "服务运行正常",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## 微信小程序端使用示例

```javascript
// 登录
wx.login({
  success: (res) => {
    if (res.code) {
      wx.request({
        url: 'http://localhost:3000/api/wechat/login',
        method: 'POST',
        data: {
          code: res.code
        },
        success: (response) => {
          if (response.data.success) {
            const { openid, session_key, token } = response.data.data;
            // 保存token到本地存储
            wx.setStorageSync('token', token);
            wx.setStorageSync('session_key', session_key);
          }
        }
      });
    }
  }
});

// 获取用户信息
wx.getUserProfile({
  desc: '用于完善用户资料',
  success: (res) => {
    const { encryptedData, iv } = res;
    const sessionKey = wx.getStorageSync('session_key');
    
    wx.request({
      url: 'http://localhost:3000/api/wechat/userinfo',
      method: 'POST',
      data: {
        encryptedData,
        iv,
        sessionKey
      },
      success: (response) => {
        if (response.data.success) {
          console.log('用户信息:', response.data.data);
        }
      }
    });
  }
});
```

## 错误码说明

微信登录接口可能返回的错误码：

| 错误码 | 错误描述 | 解决方案 |
|--------|----------|----------|
| 40029 | code无效 | js_code无效，请重新获取 |
| 45011 | API调用太频繁 | 请稍候再试 |
| 40226 | 高风险用户 | 高风险等级用户，登录被拦截 |
| -1 | 系统错误 | 系统繁忙，请稍候再试 |

## 注意事项

1. 请确保在微信公众平台配置正确的AppID和AppSecret
2. 生产环境中请使用HTTPS
3. 建议使用JWT等更安全的token管理方案
4. 实际项目中应该将用户信息存储到数据库中
5. 当前配置的AppID: `wx8c0384130a03beaf`
