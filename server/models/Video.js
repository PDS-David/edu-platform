const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Video = sequelize.define('Video', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    courseId: { type: DataTypes.INTEGER, field: 'course_id' },
    topicId: { type: DataTypes.INTEGER, field: 'topic_id' },
    title: { type: DataTypes.STRING, allowNull: false },
    description: { type: DataTypes.TEXT },
    url: { type: DataTypes.TEXT },
    thumbnailUrl: { type: DataTypes.STRING, field: 'thumbnail_url' },
    durationSeconds: { type: DataTypes.INTEGER, field: 'duration_seconds' },
    isPremium: { type: DataTypes.BOOLEAN, defaultValue: false, field: 'is_premium' },
    orderIndex: { type: DataTypes.INTEGER, defaultValue: 0, field: 'order_index' },
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true, field: 'is_active' },
    uploadedBy: { type: DataTypes.INTEGER, field: 'uploaded_by' },
    provider: { type: DataTypes.STRING }, // e.g. youtube, vimeo, s3
    externalId: { type: DataTypes.STRING, field: 'external_id' },
  }, {
    tableName: 'videos',
    underscored: true,
    timestamps: true,
  });

  Video.associate = (models) => {
    Video.belongsTo(models.Course, { foreignKey: 'course_id' });
    Video.belongsTo(models.Topic, { foreignKey: 'topic_id' });
    Video.belongsTo(models.User, { foreignKey: 'uploaded_by', as: 'uploader' });
  };

  return Video;
};
