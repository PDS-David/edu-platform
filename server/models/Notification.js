const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Notification = sequelize.define('Notification', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    userId: { type: DataTypes.INTEGER, allowNull: false, field: 'user_id' },
    title: { type: DataTypes.STRING, allowNull: false },
    message: { type: DataTypes.TEXT, allowNull: false },
    type: { type: DataTypes.STRING }, // e.g. info, success, warning, error
    isRead: { type: DataTypes.BOOLEAN, defaultValue: false, field: 'is_read' },
    readAt: { type: DataTypes.DATE, field: 'read_at' },
    link: { type: DataTypes.STRING }, // optional deep link
    metadata: { type: DataTypes.JSONB },
  }, {
    tableName: 'notifications',
    underscored: true,
    timestamps: true,
  });

  Notification.associate = (models) => {
    Notification.belongsTo(models.User, { foreignKey: 'user_id' });
  };

  return Notification;
};
