const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Note = sequelize.define('Note', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    userId: { type: DataTypes.INTEGER, allowNull: false, field: 'user_id' },
    subtopicId: { type: DataTypes.INTEGER, field: 'subtopic_id' },
    title: { type: DataTypes.STRING },
    content: { type: DataTypes.TEXT, allowNull: false },
    isPublic: { type: DataTypes.BOOLEAN, defaultValue: false, field: 'is_public' },
    tags: { type: DataTypes.ARRAY(DataTypes.STRING) },
  }, {
    tableName: 'notes',
    underscored: true,
    timestamps: true,
  });

  Note.associate = (models) => {
    Note.belongsTo(models.User, { foreignKey: 'user_id' });
    Note.belongsTo(models.Subtopic, { foreignKey: 'subtopic_id' });
  };

  return Note;
};
