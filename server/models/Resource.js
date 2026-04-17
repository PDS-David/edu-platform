// server/models/Resource.js
// Aligned to migration_003.sql — resources table.
// Real columns: id (UUID), topic_id, subject_id, subtopic_id, uploaded_by,
//   title, resource_type (VARCHAR 50), file_url, hls_path, file_size_bytes,
//   content_url, is_free, created_at
// Extra columns added at runtime by resourceRoutes ensureExtraColumns():
//   is_staged, is_active, original_filename, mime_type, updated_at
//
// NOTE: The old model defined `type` as a Postgres ENUM which created
// `enum_resources_type`. That column does NOT exist in the real schema.
// Using DataTypes.STRING avoids Sequelize creating/enforcing any enum.

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Resource = sequelize.define('Resource', {
    id: {
      type:         DataTypes.UUID,
      primaryKey:   true,
      defaultValue: DataTypes.UUIDV4,
    },
    topicId:      { type: DataTypes.INTEGER,      field: 'topic_id'    },
    subjectId:    { type: DataTypes.INTEGER,      field: 'subject_id'  },
    subtopicId:   { type: DataTypes.INTEGER,      field: 'subtopic_id' },
    uploadedBy:   { type: DataTypes.UUID,         field: 'uploaded_by' },
    title:        { type: DataTypes.STRING(255),  allowNull: false     },
    resourceType: { type: DataTypes.STRING(50),   field: 'resource_type', defaultValue: 'document' },
    fileUrl:      { type: DataTypes.TEXT,         field: 'file_url'        },
    hlsPath:      { type: DataTypes.TEXT,         field: 'hls_path'        },
    fileSizeBytes:{ type: DataTypes.INTEGER,      field: 'file_size_bytes' },
    contentUrl:   { type: DataTypes.TEXT,         field: 'content_url'     },
    isFree:       { type: DataTypes.BOOLEAN,      field: 'is_free',   defaultValue: false },
    // Runtime-added columns (ensureExtraColumns in resourceRoutes.js)
    isStaged:     { type: DataTypes.BOOLEAN,      field: 'is_staged',  defaultValue: false },
    isActive:     { type: DataTypes.BOOLEAN,      field: 'is_active',  defaultValue: true  },
    originalFilename: { type: DataTypes.STRING(255), field: 'original_filename' },
    mimeType:     { type: DataTypes.STRING(120),  field: 'mime_type'           },
  }, {
    tableName:   'resources',
    underscored: true,
    timestamps:  true,
    createdAt:   'created_at',
    updatedAt:   'updated_at',
  });

  Resource.associate = (models) => {
    Resource.belongsTo(models.Topic,   { foreignKey: 'topic_id'   });
    Resource.belongsTo(models.Subtopic,{ foreignKey: 'subtopic_id'});
    Resource.belongsTo(models.User,    { foreignKey: 'uploaded_by', as: 'uploader' });
  };

  return Resource;
};
