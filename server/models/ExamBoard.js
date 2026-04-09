const { DataTypes } = require('sequelize');
module.exports = (sequelize) => {
  const ExamBoard = sequelize.define('ExamBoard', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING, allowNull: false },
    fullName: { type: DataTypes.STRING, field: 'full_name' },
    code: { type: DataTypes.STRING },
    country: { type: DataTypes.STRING },
    description: { type: DataTypes.TEXT },
    logoUrl: { type: DataTypes.STRING, field: 'logo_url' },
    iconEmoji: { type: DataTypes.STRING(10), field: 'icon_emoji' },
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true, field: 'is_active' },
    displayOrder: { type: DataTypes.INTEGER, defaultValue: 0, field: 'display_order' },
  }, {
    tableName: 'exam_boards',
    underscored: true,
    timestamps: true,
  });
  ExamBoard.associate = (models) => {
    ExamBoard.hasMany(models.Subject, { foreignKey: 'exam_board_id' });
  };
  return ExamBoard;
};
