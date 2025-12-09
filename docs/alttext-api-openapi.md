# Alt Text API (OpenAPI snippet)

```yaml
openapi: 3.0.0
info:
  title: Alt Text API
  version: 1.0.0
servers:
  - url: https://your-api-host
paths:
  /api/alt-text:
    post:
      summary: Generate alt text for a single image
      security:
        - bearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                image:
                  type: object
                  required: [base64, width, height, mime_type]
                  properties:
                    base64:
                      type: string
                      description: Raw base64 (no data URL prefix)
                    width:
                      type: integer
                    height:
                      type: integer
                    mime_type:
                      type: string
                      example: image/jpeg
                context:
                  type: object
                  properties:
                    title:
                      type: string
                    caption:
                      type: string
                    pageTitle:
                      type: string
                    altTextSuggestion:
                      type: string
      responses:
        '200':
          description: Alt text generated
          content:
            application/json:
              schema:
                type: object
                properties:
                  altText:
                    type: string
                  warnings:
                    type: array
                    items:
                      type: string
                  usage:
                    type: object
                    properties:
                      prompt_tokens:
                        type: integer
                      completion_tokens:
                        type: integer
                  meta:
                    type: object
                    properties:
                      usedFallback:
                        type: boolean
                      modelUsed:
                        type: string
        '400':
          description: Bad request
        '401':
          description: Unauthorized (missing/invalid token)
        '429':
          description: Rate limit exceeded
  /api/jobs:
    post:
      summary: Enqueue a batch of images
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [images]
              properties:
                images:
                  type: array
                  items:
                    type: object
                    properties:
                      image:
                        $ref: '#/paths/~1api~1alt-text/post/requestBody/content/application~1json/schema/properties/image'
                      context:
                        type: object
                context:
                  type: object
      responses:
        '200':
          description: Job queued
          content:
            application/json:
              schema:
                type: object
                properties:
                  jobId:
                    type: string
                  status:
                    type: string
  /api/jobs/{jobId}:
    get:
      summary: Get job status/results
      parameters:
        - in: path
          name: jobId
          required: true
          schema:
            type: string
      responses:
        '200':
          description: Job status/results
        '404':
          description: Job not found
components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
```
