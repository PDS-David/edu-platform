const sequelize = require('./config/database');

async function testConnection() {
  try {

    // Test Sequelize authentication
    await sequelize.authenticate();

    console.log('✅ Database connected successfully');

    // Run a simple query
    const [results] = await sequelize.query(
      'SELECT NOW() AS current_time;'
    );

    console.log(
      '🕒 Database time:',
      results[0].current_time
    );

    console.log('🎯 Database test completed successfully.');

  } catch (error) {

    console.error('❌ Database connection failed');
    console.error(error);

  } finally {

    // Proper Sequelize shutdown
    await sequelize.close();

  }
}

testConnection();