import { MongoMemoryServer } from "mongodb-memory-server";
import { writeFileSync } from "node:fs";

const mongod = await MongoMemoryServer.create({
  instance: { port: 27017, dbName: "eventvault" },
});

const uri = mongod.getUri("eventvault");
writeFileSync("/tmp/eventvault-mongo-uri.txt", uri);
console.log(`Memory MongoDB ready: ${uri}`);

// Keep process alive so the in-memory server stays up.
process.on("SIGINT", async () => {
  await mongod.stop();
  process.exit(0);
});
process.on("SIGTERM", async () => {
  await mongod.stop();
  process.exit(0);
});

await new Promise(() => {});
