import {
  DynamoDBClient,
  CreateTableCommand,
  DescribeTableCommand,
  ResourceNotFoundException,
} from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  QueryCommand,
  DeleteCommand,
  BatchWriteCommand,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";

export const TABLE_NAME = process.env.AWS_DYNAMODB_TABLE || "ivx-holdings";
const rawRegion = (process.env.AWS_REGION || "").trim();
const REGION = /^[a-z]{2}-[a-z]+-\d$/.test(rawRegion) ? rawRegion : "us-east-1";

function makeDynamoClient(): DynamoDBDocumentClient | null {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey) {
    console.warn("[DynamoDB] Credentials not configured — DB unavailable");
    return null;
  }
  const base = new DynamoDBClient({
    region: REGION,
    credentials: { accessKeyId, secretAccessKey },
  });
  return DynamoDBDocumentClient.from(base, {
    marshallOptions: { removeUndefinedValues: true },
  });
}

async function ensureTable(raw: DynamoDBClient): Promise<void> {
  try {
    await raw.send(new DescribeTableCommand({ TableName: TABLE_NAME }));
    console.log(`[DynamoDB] Table "${TABLE_NAME}" exists`);
  } catch (err: any) {
    if (err instanceof ResourceNotFoundException || err?.name === "ResourceNotFoundException") {
      console.log(`[DynamoDB] Creating table "${TABLE_NAME}" …`);
      await raw.send(
        new CreateTableCommand({
          TableName: TABLE_NAME,
          BillingMode: "PAY_PER_REQUEST",
          AttributeDefinitions: [
            { AttributeName: "pk", AttributeType: "S" },
            { AttributeName: "sk", AttributeType: "S" },
          ],
          KeySchema: [
            { AttributeName: "pk", KeyType: "HASH" },
            { AttributeName: "sk", KeyType: "RANGE" },
          ],
        })
      );
      await waitForActive(raw);
      console.log(`[DynamoDB] Table "${TABLE_NAME}" created`);
    } else {
      throw err;
    }
  }
}

async function waitForActive(raw: DynamoDBClient, maxMs = 30000): Promise<void> {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    const res = await raw.send(new DescribeTableCommand({ TableName: TABLE_NAME }));
    if (res.Table?.TableStatus === "ACTIVE") return;
    await new Promise(r => setTimeout(r, 1500));
  }
  throw new Error(`[DynamoDB] Table did not become ACTIVE within ${maxMs}ms`);
}

export class DynamoDatabase {
  private client: DynamoDBDocumentClient | null = null;
  private rawClient: DynamoDBClient | null = null;
  private _ready = false;

  async init(): Promise<void> {
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
    if (!accessKeyId || !secretAccessKey) {
      console.warn("[DynamoDB] No credentials — running in memory-only mode");
      return;
    }
    this.rawClient = new DynamoDBClient({
      region: REGION,
      credentials: { accessKeyId, secretAccessKey },
    });
    this.client = DynamoDBDocumentClient.from(this.rawClient, {
      marshallOptions: { removeUndefinedValues: true },
    });
    await ensureTable(this.rawClient);
    this._ready = true;
    console.log(`[DynamoDB] Ready — table=${TABLE_NAME} region=${REGION}`);
  }

  get isAvailable(): boolean {
    return this._ready && this.client !== null;
  }

  async put(collection: string, id: string, data: unknown): Promise<void> {
    if (!this.client) return;
    await this.client.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          pk: `entity#${collection}`,
          sk: id,
          data: JSON.stringify(data),
          ts: new Date().toISOString(),
        },
      })
    );
  }

  async get<T>(collection: string, id: string): Promise<T | null> {
    if (!this.client) return null;
    const res = await this.client.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { pk: `entity#${collection}`, sk: id },
      })
    );
    return res.Item ? (JSON.parse(res.Item.data as string) as T) : null;
  }

  async getAll<T>(collection: string): Promise<T[]> {
    if (!this.client) return [];
    const items: T[] = [];
    let lastKey: Record<string, any> | undefined;
    do {
      const res = await this.client.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          KeyConditionExpression: "pk = :pk",
          ExpressionAttributeValues: { ":pk": `entity#${collection}` },
          ExclusiveStartKey: lastKey,
        })
      );
      for (const item of res.Items ?? []) {
        items.push(JSON.parse(item.data as string) as T);
      }
      lastKey = res.LastEvaluatedKey as Record<string, any> | undefined;
    } while (lastKey);
    return items;
  }

  async remove(collection: string, id: string): Promise<void> {
    if (!this.client) return;
    await this.client.send(
      new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { pk: `entity#${collection}`, sk: id },
      })
    );
  }

  async clearCollection(collection: string): Promise<void> {
    if (!this.client) return;
    let lastKey: Record<string, any> | undefined;
    do {
      const res = await this.client.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          KeyConditionExpression: "pk = :pk",
          ExpressionAttributeValues: { ":pk": `entity#${collection}` },
          ProjectionExpression: "pk, sk",
          ExclusiveStartKey: lastKey,
        })
      );
      const items = res.Items ?? [];
      for (let i = 0; i < items.length; i += 25) {
        const batch = items.slice(i, i + 25);
        if (batch.length === 0) break;
        await this.client.send(
          new BatchWriteCommand({
            RequestItems: {
              [TABLE_NAME]: batch.map(item => ({
                DeleteRequest: { Key: { pk: item.pk, sk: item.sk } },
              })),
            },
          })
        );
      }
      lastKey = res.LastEvaluatedKey as Record<string, any> | undefined;
    } while (lastKey);
  }

  async count(collection: string): Promise<number> {
    if (!this.client) return 0;
    let count = 0;
    let lastKey: Record<string, any> | undefined;
    do {
      const res = await this.client.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          KeyConditionExpression: "pk = :pk",
          ExpressionAttributeValues: { ":pk": `entity#${collection}` },
          Select: "COUNT",
          ExclusiveStartKey: lastKey,
        })
      );
      count += res.Count ?? 0;
      lastKey = res.LastEvaluatedKey as Record<string, any> | undefined;
    } while (lastKey);
    return count;
  }

  async hasData(collection: string): Promise<boolean> {
    if (!this.client) return false;
    const res = await this.client.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: "pk = :pk",
        ExpressionAttributeValues: { ":pk": `entity#${collection}` },
        Select: "COUNT",
        Limit: 1,
      })
    );
    return (res.Count ?? 0) > 0;
  }

  async putUserEntity(collection: string, userId: string, id: string, data: unknown): Promise<void> {
    if (!this.client) return;
    await this.client.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          pk: `uentity#${collection}#${userId}`,
          sk: id,
          data: JSON.stringify(data),
          ts: new Date().toISOString(),
        },
      })
    );
  }

  async getUserEntities<T>(collection: string, userId: string): Promise<T[]> {
    if (!this.client) return [];
    const items: T[] = [];
    let lastKey: Record<string, any> | undefined;
    do {
      const res = await this.client.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          KeyConditionExpression: "pk = :pk",
          ExpressionAttributeValues: { ":pk": `uentity#${collection}#${userId}` },
          ExclusiveStartKey: lastKey,
        })
      );
      for (const item of res.Items ?? []) {
        items.push(JSON.parse(item.data as string) as T);
      }
      lastKey = res.LastEvaluatedKey as Record<string, any> | undefined;
    } while (lastKey);
    return items;
  }

  async getAllUserEntities<T>(collection: string): Promise<Array<{ userId: string; id: string; data: T }>> {
    if (!this.client) return [];
    const results: Array<{ userId: string; id: string; data: T }> = [];
    let lastKey: Record<string, any> | undefined;
    const prefix = `uentity#${collection}#`;
    do {
      const res = await this.client.send(
        new ScanCommand({
          TableName: TABLE_NAME,
          FilterExpression: "begins_with(pk, :prefix)",
          ExpressionAttributeValues: { ":prefix": prefix },
          ExclusiveStartKey: lastKey,
        })
      );
      for (const item of res.Items ?? []) {
        const userId = (item.pk as string).slice(prefix.length);
        results.push({ userId, id: item.sk as string, data: JSON.parse(item.data as string) as T });
      }
      lastKey = res.LastEvaluatedKey as Record<string, any> | undefined;
    } while (lastKey);
    return results;
  }

  async removeUserEntity(collection: string, userId: string, id: string): Promise<void> {
    if (!this.client) return;
    await this.client.send(
      new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { pk: `uentity#${collection}#${userId}`, sk: id },
      })
    );
  }

  async clearUserCollection(collection: string, userId: string): Promise<void> {
    if (!this.client) return;
    const pk = `uentity#${collection}#${userId}`;
    let lastKey: Record<string, any> | undefined;
    do {
      const res = await this.client.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          KeyConditionExpression: "pk = :pk",
          ExpressionAttributeValues: { ":pk": pk },
          ProjectionExpression: "pk, sk",
          ExclusiveStartKey: lastKey,
        })
      );
      const items = res.Items ?? [];
      for (let i = 0; i < items.length; i += 25) {
        const batch = items.slice(i, i + 25);
        if (batch.length === 0) break;
        await this.client.send(
          new BatchWriteCommand({
            RequestItems: {
              [TABLE_NAME]: batch.map(item => ({
                DeleteRequest: { Key: { pk: item.pk, sk: item.sk } },
              })),
            },
          })
        );
      }
      lastKey = res.LastEvaluatedKey as Record<string, any> | undefined;
    } while (lastKey);
  }

  async clearAllUserData(collection: string): Promise<void> {
    if (!this.client) return;
    const prefix = `uentity#${collection}#`;
    let lastKey: Record<string, any> | undefined;
    do {
      const res = await this.client.send(
        new ScanCommand({
          TableName: TABLE_NAME,
          FilterExpression: "begins_with(pk, :prefix)",
          ExpressionAttributeValues: { ":prefix": prefix },
          ProjectionExpression: "pk, sk",
          ExclusiveStartKey: lastKey,
        })
      );
      const items = res.Items ?? [];
      for (let i = 0; i < items.length; i += 25) {
        const batch = items.slice(i, i + 25);
        if (batch.length === 0) break;
        await this.client.send(
          new BatchWriteCommand({
            RequestItems: {
              [TABLE_NAME]: batch.map(item => ({
                DeleteRequest: { Key: { pk: item.pk, sk: item.sk } },
              })),
            },
          })
        );
      }
      lastKey = res.LastEvaluatedKey as Record<string, any> | undefined;
    } while (lastKey);
  }

  async setConfig(key: string, value: unknown): Promise<void> {
    if (!this.client) return;
    await this.client.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          pk: "config",
          sk: key,
          data: JSON.stringify(value),
          ts: new Date().toISOString(),
        },
      })
    );
  }

  async getConfig<T>(key: string): Promise<T | null> {
    if (!this.client) return null;
    const res = await this.client.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { pk: "config", sk: key },
      })
    );
    return res.Item ? (JSON.parse(res.Item.data as string) as T) : null;
  }

  async addAudit(id: string, action: string, userId: string, details: string): Promise<void> {
    if (!this.client) return;
    const ts = new Date().toISOString();
    await this.client.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          pk: "audit",
          sk: `${ts}#${id}`,
          data: JSON.stringify({ id, action, userId, details, timestamp: ts }),
          ts,
        },
      })
    );
  }

  async getAuditLog(limit = 100): Promise<Array<{ id: string; action: string; userId: string; details: string; timestamp: string }>> {
    if (!this.client) return [];
    const res = await this.client.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: "pk = :pk",
        ExpressionAttributeValues: { ":pk": "audit" },
        ScanIndexForward: false,
        Limit: limit,
      })
    );
    return (res.Items ?? []).map(item => JSON.parse(item.data as string));
  }

  async batchPut(collection: string, items: Array<{ id: string; data: unknown }>): Promise<void> {
    if (!this.client || items.length === 0) return;
    const pk = `entity#${collection}`;
    const ts = new Date().toISOString();
    for (let i = 0; i < items.length; i += 25) {
      const batch = items.slice(i, i + 25);
      await this.client.send(
        new BatchWriteCommand({
          RequestItems: {
            [TABLE_NAME]: batch.map(item => ({
              PutRequest: {
                Item: { pk, sk: item.id, data: JSON.stringify(item.data), ts },
              },
            })),
          },
        })
      );
    }
  }

  async batchPutUserEntities(collection: string, items: Array<{ userId: string; id: string; data: unknown }>): Promise<void> {
    if (!this.client || items.length === 0) return;
    const ts = new Date().toISOString();
    for (let i = 0; i < items.length; i += 25) {
      const batch = items.slice(i, i + 25);
      await this.client.send(
        new BatchWriteCommand({
          RequestItems: {
            [TABLE_NAME]: batch.map(item => ({
              PutRequest: {
                Item: {
                  pk: `uentity#${collection}#${item.userId}`,
                  sk: item.id,
                  data: JSON.stringify(item.data),
                  ts,
                },
              },
            })),
          },
        })
      );
    }
  }
}

export const dynamoDB = new DynamoDatabase();
