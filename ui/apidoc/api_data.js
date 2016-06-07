define({ "api": [
  {
    "type": "post",
    "url": "/exam/comment/:exam_id",
    "title": "Add comment for exam",
    "name": "PostExamComment",
    "group": "Exam",
    "header": {
      "fields": {
        "Header": [
          {
            "group": "Header",
            "type": "String",
            "optional": false,
            "field": "authorization",
            "description": "<p>A valid JWT token (Bearer:)</p>"
          }
        ]
      }
    },
    "parameter": {
      "fields": {
        "Parameter": [
          {
            "group": "Parameter",
            "type": "Number",
            "optional": false,
            "field": "exam_id",
            "description": "<p>Exam ID</p>"
          }
        ]
      }
    },
    "success": {
      "examples": [
        {
          "title": "Success-Response:",
          "content": "HTTP/1.1 200 OK\n{\n  \"user_id\": 1,\n  \"comment\": \"test omment\",\n  \"date\": \"2016-05-23T15:53:51.093Z\"\n}",
          "type": "json"
        }
      ]
    },
    "version": "0.0.0",
    "filename": "api/controllers/exam.js",
    "groupTitle": "Exam"
  },
  {
    "type": "get",
    "url": "/health",
    "title": "Get current service status",
    "name": "Health",
    "group": "System",
    "success": {
      "fields": {
        "Success 200": [
          {
            "group": "Success 200",
            "type": "String",
            "optional": false,
            "field": "status",
            "description": "<p>'ok' or 'failed'</p>"
          }
        ]
      }
    },
    "version": "0.0.0",
    "filename": "api/controllers/root.js",
    "groupTitle": "System"
  }
] });
