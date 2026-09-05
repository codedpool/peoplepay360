const { PrismaClient } = require("@prisma/client");
require("./env"); // side effect: loads dotenv and validates required vars before Prisma reads them

const prisma = new PrismaClient();

module.exports = { prisma };
