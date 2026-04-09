const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Subtopic = sequelize.define('Subtopic', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    topicId: { type: DataTypes.INTEGER, allowNull: false, field: 'topic_id' },
    subjectId: { type: DataTypes.INTEGER, field: 'subject_id' }, // used by userMemory raw SQL
    name: { type: DataTypes.STRING, allowNull: false },
    description: { type: DataTypes.TEXT },
    content: { type: DataTypes.TEXT },
    orderIndex: { type: DataTypes.INTEGER, defaultValue: 0, field: 'order_index' },
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true, field: 'is_active' },
  }, {
    tableName: 'subtopics',
    underscored: true,
    timestamps: true,
  });

  Subtopic.associate = (models) => {
    Subtopic.belongsTo(models.Topic, { foreignKey: 'topic_id' });
    Subtopic.belongsTo(models.Subject, { foreignKey: 'subject_id' });
  };

  return Subtopic;
};
