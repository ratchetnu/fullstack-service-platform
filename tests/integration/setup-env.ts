// Runs in every test worker before the test file is imported.
import { DEFAULT_TEST_DATABASE_URL } from "./global-setup";

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? DEFAULT_TEST_DATABASE_URL;
