import mongoose from 'mongoose';

const urlsToRemove = [
    'https://blinkit.com/cn/frozen-indian-breads/cid/1487/116',
    'https://blinkit.com/cn/frozen-veg/cid/1487/157',
    'https://blinkit.com/cn/frozen-peas-corn/cid/1487/172',
    'https://blinkit.com/cn/frozen-potato-snacks/cid/1487/122',
    'https://blinkit.com/cn/other-frozen-vegetables/cid/1487/222',
    'https://blinkit.com/cn/other-frozen-snacks/cid/1487/125',
    'https://www.dmart.in/category/frozen-vegetable',
    'https://www.swiggy.com/instamart/category-listing?categoryName=Fresh+Vegetables&filterId=68243edc0c0f930001b2188d&filterName=Frozen+Vegetables&offset=0&showAgeConsent=false&storeId=1404643&taxonomyType=Speciality+taxonomy+1',
    'https://www.zepto.com/cn/fruits-vegetables/frozen-veggies-pulp/cid/64374cfe-d06f-4a01-898e-c07c46462c36/scid/287a523f-f6c5-4f0c-b00a-4d872c837b80',
    'https://www.flipkart.com/hyperlocal/hloc/jcen/pr?sid=hloc%2F0072%2Fjcen&marketplace=HYPERLOCAL&pageUID=1766499285460'
];

async function main() {
    try {
        await mongoose.connect('mongodb+srv://creatosaurus1:EOaVFfQ5YhOD3UhF@creatosaurus.7trc5.mongodb.net/quickcommerce');
        const res = await mongoose.connection.collection('productsnapshots').deleteMany({
            scrapedAt: new Date('2026-03-10T02:30:00.000Z'),
            categoryUrl: { $in: urlsToRemove }
        });
        console.log('Deleted ' + res.deletedCount + ' products snapshots from the frozen categories.');
    } catch(e) {
        console.error(e);
    } finally {
        await mongoose.disconnect();
    }
}

main();
