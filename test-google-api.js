import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

const apiKey = process.env.GOOGLE_MAPS_API_KEY;

if (!apiKey) {
  console.error('❌ GOOGLE_MAPS_API_KEY tidak ditemukan di .env');
  process.exit(1);
}

console.log('🔑 Testing Google Maps API Key...');
console.log(`API Key: ${apiKey.substring(0, 10)}...${apiKey.substring(apiKey.length - 4)}\n`);

async function testPlacesAPI() {
  try {
    console.log('📍 Testing Places API (New)...');
    
    const url = 'https://places.googleapis.com/v1/places:searchText';
    const response = await axios.post(url, {
      textQuery: 'restaurant in Jakarta'
    }, {
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress'
      },
      timeout: 10000
    });

    console.log('✅ Places API (New) berhasil!');
    console.log(`   Found ${response.data?.places?.length || 0} places\n`);
    return true;
  } catch (error) {
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;
      
      console.error(`❌ Places API (New) error (${status}):`);
      console.error(`   ${data?.error?.message || JSON.stringify(data)}\n`);
      
      if (status === 403) {
        console.error('💡 Solusi:');
        console.error('   1. Pastikan Places API (New) sudah di-enable di Google Cloud Console');
        console.error('   2. Cek API key restrictions:');
        console.error('      - Buka: https://console.cloud.google.com/apis/credentials');
        console.error('      - Klik API key Anda');
        console.error('      - Di "API restrictions", pastikan "Places API (New)" tercentang');
        console.error('   3. Tunggu 2-5 menit setelah enable API (propagation time)');
        console.error('   4. Pastikan billing account aktif\n');
      }
    } else {
      console.error(`❌ Network error: ${error.message}\n`);
    }
    return false;
  }
}

async function testMapsEmbedAPI() {
  try {
    console.log('🗺️  Testing Maps Embed API...');
    
    const url = `https://www.google.com/maps/embed/v1/place?key=${apiKey}&q=Jakarta`;
    const response = await axios.get(url, {
      timeout: 10000,
      validateStatus: (status) => status < 500
    });

    if (response.status === 200) {
      console.log('✅ Maps Embed API berhasil!\n');
      return true;
    } else {
      console.error(`❌ Maps Embed API error (${response.status})\n`);
      return false;
    }
  } catch (error) {
    if (error.response) {
      console.error(`❌ Maps Embed API error (${error.response.status}):`);
      console.error(`   ${error.response.data || error.message}\n`);
    } else {
      console.error(`❌ Network error: ${error.message}\n`);
    }
    return false;
  }
}

async function main() {
  console.log('='.repeat(50));
  console.log('Google Maps API Test');
  console.log('='.repeat(50) + '\n');

  const placesOk = await testPlacesAPI();
  const embedOk = await testMapsEmbedAPI();

  console.log('='.repeat(50));
  console.log('Summary:');
  console.log(`  Places API (New): ${placesOk ? '✅ OK' : '❌ ERROR'}`);
  console.log(`  Maps Embed API:   ${embedOk ? '✅ OK' : '❌ ERROR'}`);
  console.log('='.repeat(50));

  if (!placesOk || !embedOk) {
    console.log('\n⚠️  Beberapa API gagal. Cek solusi di atas.');
    process.exit(1);
  } else {
    console.log('\n✅ Semua API berfungsi dengan baik!');
  }
}

main();

