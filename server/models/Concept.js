const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Concept = sequelize.define('Concept', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    subtopicId: { type: DataTypes.INTEGER, field: 'subtopic_id' },
    title: { type: DataTypes.STRING, allowNull: false },
    definition: { type: DataTypes.TEXT },
    explanation: { type: DataTypes.TEXT },
    examples: { type: DataTypes.TEXT },
    imageUrl: { type: DataTypes.STRING, field: 'image_url' },
    orderIndex: { type: DataTypes.INTEGER, defaultValue: 0, field: 'order_index' },
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true, field: 'is_active' },
    createdBy: { type: DataTypes.INTEGER, field: 'created_by' },
  }, {
    tableName: 'concepts',
    underscored: true,
    timestamps: true,
  });

  Concept.associate = (models) => {
    Concept.belongsTo(models.Subtopic, { foreignKey: 'subtopic_id' });
    Concept.belongsTo(models.User, { foreignKey: 'created_by', as: 'creator' });
  };

  return Concept;
};
