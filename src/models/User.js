class User {
  constructor(data = {}) {
    this.openid = data.openid || null;
    this.nickname = data.nickname || null;
    this.avatar_url = data.avatar_url || null;
    this.gender = data.gender || null;
    this.country = data.country || null;
    this.province = data.province || null;
    this.city = data.city || null;
    this.language = data.language || null;
    this.create_time = data.create_time || null;
    this.update_time = data.update_time || null;
    this.last_login_time = data.last_login_time || null;
    this.session_key = data.session_key || null;
    this.unionid = data.unionid || null;
    this.points =
      data.points !== undefined && data.points !== null ? data.points : 0;
  }

  // 转换为数据库格式
  toDbFormat() {
    return {
      openid: this.openid,
      nickname: this.nickname,
      avatar_url: this.avatar_url,
      gender: this.gender,
      country: this.country,
      province: this.province,
      city: this.city,
      language: this.language,
      create_time: this.create_time,
      update_time: this.update_time,
      last_login_time: this.last_login_time,
      session_key: this.session_key,
      unionid: this.unionid,
      points: this.points
    };
  }

  // 从数据库数据创建实例
  static fromDbData(data) {
    return new User(data);
  }
}

module.exports = User;
