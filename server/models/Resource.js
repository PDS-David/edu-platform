const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Resource = sequelize.define('Resource', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    topicId: { type: DataTypes.INTEGER, field: 'topic_id' },
    subtopicId: { type: DataTypes.INTEGER, field: 'subtopic_id' },
    title: { type: DataTypes.STRING, allowNull: false },
    type: { type: DataTypes.ENUM('video', 'pdf', 'link', 'note', 'image', 'other'), defaultValue: 'other' },
    url: { type: DataTypes.TEXT },
    content: { type: DataTypes.TEXT },
    description: { type: DataTypes.TEXT },
    isPremium: { type: DataTypes.BOOLEAN, defaultValue: false, field: 'is_premium' },
    orderIndex: { type: DataTypes.INTEGER, defaultValue: 0, field: 'order_index' },
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true, field: 'is_active' },
    uploadedBy: { type: DataTypes.INTEGER, field: 'uploaded_by' },
  }, {
    tableName: 'resources',
    underscored: true,
    timestamps: true,
  });

  Resource.associate = (models) => {
    Resource.belongsTo(models.Topic, { foreignKey: 'topic_id' });
    Resource.belongsTo(models.Subtopic, { foreignKey: 'subtopic_id' });
    Resource.belongsTo(models.User, { foreignKey: 'uploaded_by', as: 'uploader' });
  };

  return Resource;
};
