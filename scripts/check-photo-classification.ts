import mysql from 'mysql2/promise';

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL!);
  const [rows] = await conn.execute(
    'SELECT photo_classification_json FROM ai_assessments WHERE id = 13290001'
  );
  await conn.end();
  const row = (rows as any[])[0];
  if (row?.photo_classification_json) {
    const data = typeof row.photo_classification_json === 'string'
      ? JSON.parse(row.photo_classification_json)
      : row.photo_classification_json;
    // Show summary
    const summary = data?.summary;
    console.log('SUMMARY:', JSON.stringify(summary, null, 2));
    // Show each classified image category
    const allImages = [
      ...(data?.damagePhotos ?? []).map((p: any) => ({ ...p, _cat: 'damagePhoto' })),
      ...(data?.vehicleOverviews ?? []).map((p: any) => ({ ...p, _cat: 'vehicleOverview' })),
      ...(data?.quotationImages ?? []).map((p: any) => ({ ...p, _cat: 'quotationImage' })),
      ...(data?.documentPages ?? []).map((p: any) => ({ ...p, _cat: 'documentPage' })),
      ...(data?.otherImages ?? []).map((p: any) => ({ ...p, _cat: 'other' })),
    ];
    console.log(`\nTOTAL CLASSIFIED IMAGES: ${allImages.length}`);
    for (const img of allImages) {
      console.log(`  [${img._cat}] page=${img.pageNumber ?? '?'} conf=${img.confidence?.toFixed(2) ?? '?'} llm=${img.llmClassified ?? false}`);
    }
  } else {
    console.log('NO CLASSIFICATION DATA for assessment 13290001');
  }
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
