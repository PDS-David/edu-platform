const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Topic = sequelize.define('Topic', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    subjectId: { type: DataTypes.INTEGER, allowNull: false, field: 'subject_id' },
    name: { type: DataTypes.STRING, allowNull: false },
    description: { type: DataTypes.TEXT },
    orderIndex: { type: DataTypes.INTEGER, defaultValue: 0, field: 'order_index' },
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true, field: 'is_active' },
  }, {
    tableName: 'topics',
    underscored: true,
    timestamps: true,
  });

  Topic.associate = (models) => {
    Topic.belongsTo(models.Subject, { foreignKey: 'subject_id' });
    Topic.hasMany(models.Subtopic, { foreignKey: 'topic_id' });
    Topic.hasMany(models.Resource, { foreignKey: 'topic_id' });
    Topic.hasMany(models.Quiz, { foreignKey: 'topic_id' });
  };

  return Topic;
};
