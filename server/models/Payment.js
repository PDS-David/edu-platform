const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Payment = sequelize.define('Payment', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    userId: { type: DataTypes.INTEGER, allowNull: false, field: 'user_id' },
    courseId: { type: DataTypes.INTEGER, field: 'course_id' },
    amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    currency: { type: DataTypes.STRING(10), defaultValue: 'GBP' },
    status: { type: DataTypes.ENUM('pending', 'completed', 'failed', 'refunded'), defaultValue: 'pending' },
    provider: { type: DataTypes.STRING }, // e.g. stripe, paystack, flutterwave
    providerRef: { type: DataTypes.STRING, field: 'provider_ref' }, // external transaction ID
    metadata: { type: DataTypes.JSONB },
    paidAt: { type: DataTypes.DATE, field: 'paid_at' },
  }, {
    tableName: 'payments',
    underscored: true,
    timestamps: true,
  });

  Payment.associate = (models) => {
    Payment.belongsTo(models.User, { foreignKey: 'user_id' });
    Payment.belongsTo(models.Course, { foreignKey: 'course_id' });
    Payment.hasOne(models.Enrollment, { foreignKey: 'payment_id' });
  };

  return Payment;
};
