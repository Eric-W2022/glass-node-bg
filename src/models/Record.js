class Record {
  constructor(data = {}) {
    this.id = data.id || null;
    this.openid = data.openid || null;
    this.count = data.count || 0;
    this.created_at = data.created_at || null;
    this.updated_at = data.updated_at || null;
    this.deleted_at = data.deleted_at || null;
  }

  // 转换为数据库格式
  toDbFormat() {
    return {
      id: this.id,
      openid: this.openid,
      count: this.count,
      created_at: this.created_at,
      updated_at: this.updated_at,
      deleted_at: this.deleted_at
    };
  }

  // 从数据库数据创建实例
  static fromDbData(data) {
    return new Record(data);
  }
}

module.exports = Record;
