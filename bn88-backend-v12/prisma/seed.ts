/// <reference types="node" />
import { seedKnowledgeBase } from "./seed/knowledge.base";

async function main() {
  // seed อื่น ๆ
  await seedKnowledgeBase();
}

main()
  .then(() => {
    console.log("All seeds finished");
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
