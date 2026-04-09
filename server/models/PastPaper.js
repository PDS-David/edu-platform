const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const PastPaper = sequelize.define('PastPaper', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    subjectId: { type: DataTypes.INTEGER, allowNull: false, field: 'subject_id' },
    title: { type: DataTypes.STRING, allowNull: false },
    year: { type: DataTypes.INTEGER },
    session: { type: DataTypes.STRING }, // e.g. May/June, Oct/Nov
    paperNumber: { type: DataTypes.STRING, field: 'paper_number' },
    fileUrl: { type: DataTypes.TEXT, field: 'file_url' },
    markschemeUrl: { type: DataTypes.TEXT, field: 'markscheme_url' },
    isPremium: { type: DataTypes.BOOLEAN, defaultValue: false, field: 'is_premium' },
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true, field: 'is_active' },
    uploadedBy: { type: DataTypes.INTEGER, field: 'uploaded_by' },
  }, {
    tableName: 'past_papers',
    underscored: true,
    timestamps: true,
  });

  PastPaper.associate = (models) => {
    PastPaper.belongsTo(models.Subject, { foreignKey: 'subject_id' });
    PastPaper.belongsTo(models.User, { foreignKey: 'uploaded_by', as: 'uploader' });
  };

  return PastPaper;
};
