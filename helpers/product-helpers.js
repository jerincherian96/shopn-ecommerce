var db=require('../config/connection')
var collection=require('../config/collections')
// const { response } = require('../app')
var ObjectId=require('mongodb').ObjectId
module.exports={
    addProduct:(product)=>{
        product.price=parseInt(product.price)
        product.stock=parseInt(product.stock)
        return new Promise(async(resolve,reject)=>{
            let productData=await db.get().collection(collection.PRODUCT_COLLECTION).findOne({model:product.model})
            if(productData){
                productData.exist=true
                resolve(productData)
            }else{
                try{
                    product.mrp=product.price
                    db.get().collection(collection.PRODUCT_COLLECTION).insertOne(product).then((data)=>{
                    console.log('product added succesfully')
                    resolve(data.insertedId)
                    })
                }catch(e){
                    console.log(e)
                    resolve({status:false})
                }
                
            }
        })
    },
    getAllProduct:()=>{
        return new Promise(async(resolve,reject)=>{
            db.get().collection(collection.PRODUCT_COLLECTION).find().toArray().then((products)=>{
                try{
                    resolve(products.reverse())
                }catch(e){
                    console.log(e)
                    reject()
                }
            })
        })
    },
    deleteProduct:(proId)=>{
        return new Promise((resolve,reject)=>{
            try{
                db.get().collection(collection.PRODUCT_COLLECTION).deleteOne({_id:ObjectId(proId)}).then(()=>{
                    resolve({something:true})
                })
            }catch(e){
                console.log(e)
                resolve({status:false})
            }
        })
    },
    getProductDetails:(productId)=>{
        return new Promise(async(resolve,reject)=>{
           db.get().collection(collection.PRODUCT_COLLECTION).findOne({_id:ObjectId(productId)}).then((product)=>{
                console.log("productdetails get cheythu");
                resolve(product)
            })
        })
    },
    updateProduct:(proId,ProductDetails)=>{
        ProductDetails.price=parseInt(ProductDetails.price)
        ProductDetails.stock=parseInt(ProductDetails.stock)
        return new Promise((resolve,reject)=>{
            try{
                db.get().collection(collection.PRODUCT_COLLECTION)
                .updateOne({_id:ObjectId(proId)},{
                    $set:{
                        model:ProductDetails.model,
                        brand:ProductDetails.brand,
                        price:ProductDetails.price,
                        size:ProductDetails.size,
                        stock:ProductDetails.stock,
                        category:ProductDetails.category,
                        description:ProductDetails.description,
                        image1:ProductDetails.image1,
                        image2:ProductDetails.image2
                    }
                }).then((response)=>{
                    resolve(response)
                })
            }catch(e){
                console.log(e)
                resolve({status:false})
            }
        })
    },
    getAllCategory:()=>{
        return new Promise(async(resolve,reject)=>{
            db.get().collection(collection.CATEGORY_COLLECTION).find().toArray().then((category)=>{
                try{
                    resolve(category.reverse())
                }catch(e){
                    console.log(e)
                    resolve({status:false})
                }
            })
        })
    },
    getProductsInCategory:(cate)=>{
        return new Promise((resolve,reject)=>{
            db.get().collection(collection.PRODUCT_COLLECTION).find({category:cate}).toArray().then((product)=>{
                console.log(product)
                resolve(product.reverse())
            })
        })
    },
    addCategory:(cat)=>{
        return new Promise(async(resolve,reject)=>{
            let categoryName=cat.category
            categoryName=categoryName.toLowerCase()
            cat.category=categoryName
            let categoryData=await db.get().collection(collection.CATEGORY_COLLECTION).findOne({category:categoryName})
            if(categoryData){
                categoryData.exist=true
                resolve(categoryData)
            }else{
                try{
                    db.get().collection(collection.CATEGORY_COLLECTION).insertOne(cat).then((data)=>{
                        console.log('Category added succesfully')
                        resolve(data)
                    })
                }catch(e){
                    console.log(e)
                    resolve({category:false})
                }
            }
        })
    },
    deleteCategory:(cate)=>{
        return new Promise((resolve,reject)=>{
            try{
                db.get().collection(collection.CATEGORY_COLLECTION).deleteOne({_id:ObjectId(cate)}).then(()=>{
                    resolve({something:true})
                })
            }catch(e){
                console.log(e)
                resolve({category:false})
            }
        })
    },
    updateCategory:(cate,cateData)=>{
        return new Promise(async(resolve,reject)=>{
            cateData.category=cateData.category.toLowerCase()
            let categoryData=await db.get().collection(collection.CATEGORY_COLLECTION).findOne({category:cateData.category})
            if(categoryData){
                categoryData.exist=true
                resolve(categoryData)
            }else{
                try{
                    db.get().collection(collection.CATEGORY_COLLECTION).updateOne({category:cate},{
                        $set:{
                            category:cateData.category
                        }
                    }).then((data)=>{
                        resolve(data)
                    })
                }catch(e){
                    console.log(e)
                    resolve({data:false})
                }
            }
        })
    },
    categoryInProduct:(cate,cateData)=>{
        return new Promise((resolve,reject)=>{
            try{
                db.get().collection(collection.PRODUCT_COLLECTION).updateMany({category:cate},{
                    $set:{
                        category:cateData.category
                    }
                }).then(()=>{
                    resolve()
                })
            }catch(e){
                console.log(e);
                resolve()
            }  
        })
    },
    fetchImage1:(proId)=>{
        return new Promise(async(resolve,reject)=>{
            let detail=await db.get().collection(collection.PRODUCT_COLLECTION).findOne({_id:ObjectId(proId)},{projection: { image1: true }})
            resolve(detail.image1)
        })
    },
    fetchImage2:(proId)=>{
        return new Promise(async(resolve,reject)=>{
            let detail=await db.get().collection(collection.PRODUCT_COLLECTION).findOne({_id:ObjectId(proId)},{projection: { image2: true }})
            resolve(detail.image2)
        })
    },
    checkProductCategory:(Category)=>{
        return new Promise(async(resolve,reject)=>{
            db.get().collection(collection.PRODUCT_COLLECTION).find({category:Category}).toArray().then((checkProduct)=>{
                if(checkProduct.length!=0){
                    resolve({stopCategoryDelete:true})
                 }else{
                     resolve(checkProduct)
                 }
            }) 
          
        })
    },
    searchInProducts:(key)=>{
        return new Promise((resolve,reject)=>{
            db.get().collection(collection.PRODUCT_COLLECTION).find(
                {
                    "$or":[
                        {brand:{$regex: key, $options: 'i'}},
                        {model:{$regex:key, $options:'i'}},
                        {category:{$regex:key, $options:'i'}},
                    ]
                }
            ).toArray().then((products)=>{
                resolve(products)
            })
        })
    },
   


    // addProduct:(product,callback)=>{
    //     db.get().collection('product').insertOne(product).then((data)=>{
    //         console.log(data.insertedId)
    //         callback(data.insertedId)
    //     })
    // },


 

}