class Device {
  constructor(data = {}) {
    this.device_id = data.device_id || null;
    this.warning_distance_cm = data.warning_distance_cm ?? null;
    this.reminder_mode = data.reminder_mode ?? 0;
    this.created_at = data.created_at || null;
    this.updated_at = data.updated_at || null;
    this.deleted_at = data.deleted_at || null;
  }

  toDbFormat() {
    return {
      device_id: this.device_id,
      warning_distance_cm: this.warning_distance_cm,
      reminder_mode: this.reminder_mode,
      created_at: this.created_at,
      updated_at: this.updated_at,
      deleted_at: this.deleted_at
    };
  }

  static fromDbData(data) {
    return new Device(data);
  }
}

module.exports = Device;
