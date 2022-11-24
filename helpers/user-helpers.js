var db=require('../config/connection')
var collection=require('../config/collections')
const bcrypt=require('bcrypt') 
const { CpsContext } = require('twilio/lib/rest/preview/trusted_comms/cps')
const { response } = require('../app')
var ObjectId=require('mongodb').ObjectId
var {uid} = require('uid')
let referralCodeGenerator = require('referral-code-generator')
const Razorpay=require('razorpay')
var paypal = require('paypal-rest-sdk');
const { AccessTokenInstance } = require('twilio/lib/rest/verify/v2/service/accessToken')
const { statSync } = require('node:fs')
const { resolve } = require('node:path')
const { WISHLIST_COLLECTION } = require('../config/collections')
var instance = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });

module.exports={
    doSignup:(user)=>{
        user.addresses=[]
        return new Promise(async(resolve,reject)=>{
            let response={}
            let referral=user.referral
            let userData1=await db.get().collection(collection.USER_COLLECTION).findOne({email:user.email})
            let userData2=await db.get().collection(collection.USER_COLLECTION).findOne({phone:user.phone})
            let ref
            if(user.referral){
                 ref=await db.get().collection(collection.WALLET_COLLECTION ).findOne({referralCode:referral})
            }else{
                ref=true
            }
            if(userData1){
                userData1.exist1=true
                resolve(userData1)
            }else if(userData2){
                userData2.exist2=true
                resolve(userData2)
            }else if(ref===null){
                response.referralWrong=true
                resolve(response)
            }else {
                try{
                    delete user.referral
                    user.password=await bcrypt.hash(user.password,10)
                    db.get().collection(collection.USER_COLLECTION).insertOne(user).then(async(userInserted)=>{
                        let uId=userInserted.insertedId
                        let uName=user.name
                        let random=referralCodeGenerator.alphaNumeric('uppercase', 5, 1)
                        let obj={
                            userId:uId,
                            userName:uName,
                            referralCode:random,
                            balance:0,
                            transaction:[]
                        }
                        await db.get().collection(collection.WALLET_COLLECTION).insertOne(obj)
                        response.user=user
                        resolve(response) 
                    })
                }catch(e){
                    console.log(e);
                    resolve({status:false})
                } 
            }
        })
    },
    doLogin:(userData)=>{
        return new Promise(async(resolve,reject)=>{
            let response={}
            let user=await db.get().collection(collection.USER_COLLECTION).findOne({email:userData.email})
            if(user){
                bcrypt.compare(userData.password,user.password).then((status)=>{
                    if(status){
                        response.user=user
                        response.status=true
                        resolve(response)
                    }else{
                        resolve({status:false})
                    }
                })
            }else{
                resolve({status:false})  
            }
        })
    },
    doAdminLogin:(adminData)=>{
        return new Promise(async(resolve,reject)=>{
            let response={}
            let admin=await db.get().collection(collection.ADMIN_COLLECTION).findOne({email:adminData.Email})
            if(admin){
                if(adminData.Password === admin.password) {
                        response.admin=admin  
                        response.status=true
                        resolve(response)
                }else{
                        resolve({status:false})
                    }
            }else{
                resolve({status:false})
            }
        })
    },
    getAllUsers:()=>{
        return new Promise(async(resolve,reject)=>{
            db.get().collection(collection.USER_COLLECTION).find().toArray().then((users)=>{
                try{
                    console.log(users[0]._id);
                    resolve(users.reverse())
                }catch(e){
                    reject()
                }
            })
            
        })
    },
    isBlocked:((uId)=>{     
        return new Promise(async(resolve,reject)=>{
            let Blocked=await db.get().collection(collection.USER_COLLECTION).findOne({$and:[{_id:ObjectId(uId)},{isBlocked:true}]})
            if(Blocked){
                let err='Your account is blocked'
                reject(err)
            }else{
                resolve()
            }
        })
    }),
    blockUser:(uId)=>{
        return new Promise((resolve,reject)=>{
            try{
                db.get().collection(collection.USER_COLLECTION).updateOne({_id:ObjectId(uId)},{$set:{isBlocked:true}}).then((response)=>{
                    resolve(response)
                })
            }catch(e){
                console.log(e)
                resolve({status:false})
            }  
        })
    },
    unblockUser:(uId)=>{
        return new Promise((resolve,reject)=>{
            try{
                db.get().collection(collection.USER_COLLECTION).updateOne({_id:ObjectId(uId)},{$set:{isBlocked:false}}).then((response)=>{
                    resolve(response)
                })
            }catch(e){
                console.log(e)
                resolve({status:false})
            }
        })
    },
    addToCart:(proId,userId)=>{
        return new Promise(async(resolve,reject)=>{
            let productDetail=await db.get().collection(collection.PRODUCT_COLLECTION).findOne({_id:ObjectId(proId)})
            Price=productDetail.price
            Model=productDetail.model
            Brand=productDetail.brand
            let prodObj={       
                item:ObjectId(proId),
                quantity:1,
                price:Price,
                model:Model,
                brand:Brand  
            } 
            let userCart=await db.get().collection(collection.CART_COLLECTION).findOne({user:ObjectId(userId)})
            if(userCart){
                let proExist=userCart.products.findIndex(product=> product.item==proId)
                if(proExist!=-1){
                    // db.get().collection(collection.CART_COLLECTION)
                    // .updateOne({user:ObjectId(userId),'products.item':ObjectId(proId)},
                    // {
                    //     $inc:{'products.$.quantity':1}
                    // }
                    // ).then(()=>{
                         resolve()
                    // })
                }else{
                    try{
                        db.get().collection(collection.CART_COLLECTION)
                        .updateOne({user:ObjectId(userId)},
                        {
                            $push:{products:prodObj}
                        }).then((response)=>{
                            resolve()
                        })
                    }catch(e){
                        console.log(e);
                        resolve()
                    }
                }
            }else{
                try{
                    let cartObj={
                        user:ObjectId(userId),
                        products:[prodObj]
                    }
                    db.get().collection(collection.CART_COLLECTION).insertOne(cartObj).then(()=>{
                        resolve()
                    })
                }catch(e){
                    console.log(e)
                    resolve()
                }
            }
        })
    },
    getCartProducts:(userId)=>{
        return new Promise(async(resolve,reject)=>{
            try{
                let cartItems=await db.get().collection(collection.CART_COLLECTION).aggregate([
                    {
                        $match:{user:ObjectId(userId)}  
                    },
                    {
                        $unwind:'$products'
                    },
                    {
                        $project:{
                            item:'$products.item',
                            quantity:'$products.quantity',
                            price:'$products.price'
                        }
                    },{
                        $lookup:{
                            from:collection.PRODUCT_COLLECTION,
                            localField:'item',
                            foreignField:'_id',
                            as:'product'
                        }
                    },
                    {
                        $project:{
                            item:1,quantity:1,price:1,product:{$arrayElemAt:['$product',0]}
                        }
                    }
                    
                ]).toArray()
                if(cartItems.length===0){
                    resolve()  
               }else{
                   console.log(cartItems[0].product)
                   resolve(cartItems) 
               }
            }catch(e){
                console.log(e)
                resolve(null)
            } 
        })
    },
    getCartCount:(userId)=>{
        return new Promise(async(resolve,reject)=>{
            let count=0
            let cart=await db.get().collection(collection.CART_COLLECTION).findOne({user:ObjectId(userId)})
            if(cart){
                count=cart.products.length
            }
            console.log(cart)
            resolve(count)
        })
    },
    changeProductQuantity:(details)=>{
        details.count=parseInt(details.count)
        details.quantity=parseInt(details.quantity)
        let stockEmpty
        return new Promise(async(resolve,reject)=>{
            if(details.count==-1 && details.quantity==1){
                resolve({Nothing:true})
            }else{
                console.log(details.plus);
               if(details.plus){
                   let product=await db.get().collection(collection.PRODUCT_COLLECTION).findOne({_id:ObjectId(details.product)})
                   if(details.quantity===product.stock){
                       stockEmpty=true
                   }else{
                       stockEmpty=false
                   }
               }
               if(stockEmpty){
                   resolve({stockEmpty:true})
               }else{
                try{
                    db.get().collection(collection.CART_COLLECTION)
                    .updateOne({_id:ObjectId(details.cart),'products.item':ObjectId(details.product)},
                    {
                        $inc:{'products.$.quantity':details.count}     
                    }
                    ).then(()=>{
                        resolve({status:true})
                    })
                }catch(e){
                    console.log(e);
                    resolve({status:false})
                }
              }
            }
        })
    },
    removeItem:(details)=>{
        return new Promise((resolve,reject)=>{
            try{
                db.get().collection(collection.CART_COLLECTION)
                .updateOne({_id:ObjectId(details.cart)},
                {
                    $pull:{products:{item:ObjectId(details.product)}}
                }
                ).then(()=>{
                    resolve(true)
                })
            }catch(e){
                console.log(e);
                resolve(false)
            }
        })
    },
    getTotalAmount:(userId)=>{
        return new Promise(async(resolve,reject)=>{
            try{
                let totalAmount=await db.get().collection(collection.CART_COLLECTION).aggregate([
                    {
                        $match:{user:ObjectId(userId)}
                    },
                    {
                        $unwind:'$products'
                    },
                    {
                        $project:{
                            item:'$products.item',
                            quantity:'$products.quantity'
                        }
                    },{
                        $lookup:{
                            from:collection.PRODUCT_COLLECTION,
                            localField:'item',
                            foreignField:'_id',
                            as:'product'
                        }
                    },
                    {
                        $project:{
                            item:1,quantity:1,product:{$arrayElemAt:['$product',0]}
                        }
                    },
                    {
                        $group:{
                            _id:null,
                            total:{$sum:{$multiply:['$quantity','$product.price']}}
                        }
                    }
                ]).toArray()
                if(totalAmount.length==0){
                    resolve({status:true})
                }else{
                    resolve(totalAmount[0].total)
                } 
            }catch(e){
                console.log(e);
                resolve({status:false})
            }
        })
    },
    checkMobileNumber:(user)=>{
        return new Promise(async(resolve,reject)=>{
            let response={}
            let userData=await db.get().collection(collection.USER_COLLECTION).findOne({phone:user.phone})
            if(userData){
                userData.exist=true
                resolve(userData)
            }else{
                resolve(response)
        }
        })
    },
    getTotalOfOneProduct:(userId,proId)=>{
        return new Promise(async(resolve,reject)=>{
            try{
                let totalAmount=await db.get().collection(collection.CART_COLLECTION).aggregate([
                    {
                        $match:{user:ObjectId(userId)} 
                    },
                    {
                        $unwind:'$products'
                    },
                    {
                        $project:{
                            item:'$products.item',
                            quantity:'$products.quantity',
                            price:'$products.price'
                        }
                    },{
                        $lookup:{
                            from:collection.PRODUCT_COLLECTION,
                            localField:'item',
                            foreignField:'_id',
                            as:'product'
                        }
                    },
                    {
                        $match:{item:ObjectId(proId)}
                    },
                    {
                        $project:{
                            item:1,quantity:1,price:1,product:{$arrayElemAt:['$product',0]}
                        }
                    },
                    {
                        $project:{
                            //_id:null,
                            total:{$sum:{$multiply:['$quantity','$product.price']}}
                        }
                    }
                    
                ]).toArray()
                if(totalAmount.length==0){
                    resolve({status:true})
                }else{
                    resolve(totalAmount[0].total)
                }
            }catch(e){
                console.log(e);
                resolve({status:false})
            } 
        })
    },
    placeOrder:(order,userId,products,total,buynow)=>{
        return new Promise(async(resolve,reject)=>{
            try{
                addressid=order.addressRadio
                let oneAddress=await db.get().collection(collection.USER_COLLECTION)
                .aggregate([
                    {
                        
                        $match:{_id:ObjectId(userId)}
                    },
                    {
                        $unwind:'$addresses'
                    },
                    {
                        $project:{
                            id:'$addresses.id',
                            name:'$addresses.name',
                            mobile:'$addresses.mobile',
                            email:'$addresses.email',
                            address:'$addresses.address',
                            state:'$addresses.state',
                            pincode:'$addresses.pincode',
                        }
                    },
                    {
                        $match:{id:addressid}
                    }
                ]).toArray()
                console.log(oneAddress)
    
                let status=order.paymentMethod==='COD'?'Placed':'Pending'
                let orderObj={
                    deliveryDetails:{
                        name:oneAddress[0].name,
                        mobile:oneAddress[0].mobile,
                        email:oneAddress[0].email,
                        address:oneAddress[0].address,
                        state:oneAddress[0].state,
                        pincode:oneAddress[0].pincode
                    },
                    userId:ObjectId(userId),
                    paymentMethod:order.paymentMethod,
                    products:products,
                    totalAmount:total,
                    status:status,
                    date:new Date().toDateString()
                }
                db.get().collection(collection.ORDER_COLLECTION).insertOne(orderObj).then(async(response)=>{
                    let prod=await db.get().collection(collection.CART_COLLECTION).findOne({user:ObjectId(userId)},{
                        projection:{'products.item':true,'products.quantity':true}
                    })
                    if(prod){
                        console.log(prod.products);
                        let prodArr=prod.products
                        prodArr.forEach(async(element)=>{
                            let quan=element.quantity
                            await db.get().collection(collection.PRODUCT_COLLECTION).updateOne({_id:ObjectId(element.item)},[
                                {
                                $set:{stock:{$subtract:['$stock',quan]}}
                                }
                            ])
                        })
                        if(buynow){
                            let cart=await db.get().collection(collection.CART_COLLECTION).findOne({user:ObjectId(userId)})
                            if(cart.products.length===1){
                                await db.get().collection(collection.CART_COLLECTION).deleteOne({user:ObjectId(userId)})
                            }else{
                                let proId=products[0].item
                                await db.get().collection(collection.CART_COLLECTION)
                                .updateOne({user:ObjectId(userId)},
                                {
                                $pull:{products:{item:ObjectId(proId)}}
                                }
                                )
                            } 
                        }else{
                            await db.get().collection(collection.CART_COLLECTION).deleteOne({user:ObjectId(userId)})
                        }
                        resolve(response.insertedId)
                    }else{
                        resolve({status:false})
                    }   
                })
            }catch(e){
                console.log(e);
                resolve({status:false})
            }
        })
    },
    getCartProductList:(userId)=>{
        return new Promise(async(resolve,reject)=>{
            db.get().collection(collection.CART_COLLECTION).findOne({user:ObjectId(userId)}).then((cart)=>{
                if(cart){
                    resolve(cart.products)
                }else{
                    resolve({status:true})
                }
            })
        })
    },
    getOrders:(userId)=>{
        return new Promise(async(resolve,reject)=>{
            db.get().collection(collection.ORDER_COLLECTION).find({userId:ObjectId(userId)}).toArray().then((order)=>{
                resolve(order.reverse())
            })
        })
    },
    getOrderProducts:(orderId)=>{
        return new Promise(async(resolve,reject)=>{
            try{
                let orderItems=await db.get().collection(collection.ORDER_COLLECTION).aggregate([
                    {
                        $match:{_id:ObjectId(orderId)}
                    },
                    {
                        $unwind:'$products'
                    },
                    {
                        $project:{
                            item:'$products.item',
                            quantity:'$products.quantity',
                            price:'$products.price'
                        }
                    },{
                        $lookup:{
                            from:collection.PRODUCT_COLLECTION,
                            localField:'item',
                            foreignField:'_id',
                            as:'product'
                        }
                    },
                    {
                        $project:{
                            item:1,quantity:1,price:1,product:{$arrayElemAt:['$product',0]}
                        }
                    }
                ]).toArray()
                if(orderItems.length===0){
                    resolve()      
               }else{
                   resolve(orderItems)  
               }
            }catch(e){
                console.log(e);
                resolve({status:false})
            }  
        })
    },
    getOrdersInAdmin:()=>{
        return new Promise(async(resolve,reject)=>{
            db.get().collection(collection.ORDER_COLLECTION).find().toArray().then((order)=>{
                resolve(order.reverse())
            })
        })
    },
    changeOrderStatus:(details)=>{
        return new Promise((resolve,reject)=>{
            try{
                db.get().collection(collection.ORDER_COLLECTION)
                .updateOne({_id:ObjectId(details.order)},
                {
                    $set:{status:details.stat}   

                }
                ).then(async()=>{
                    if(details.stat==='Cancelled'){
                        let prod=await db.get().collection(collection.ORDER_COLLECTION).findOne({_id:ObjectId(details.order)},{
                            projection:{'products.item':true,'products.quantity':true}
                        })
                        let prodArr=prod.products
                        prodArr.forEach(async(element)=>{
                            let quan=element.quantity
                            await db.get().collection(collection.PRODUCT_COLLECTION).updateOne({_id:ObjectId(element.item)},[
                                {
                                $set:{stock:{$add:['$stock',quan]}}
                                }
                            ])
                        })
                    }
                    resolve({status:true})
                }) 
            }catch(e){
                console.log(e);
                resolve({status:false})
            }
        })
    },
    returnOrder:(details,userid)=>{
        return new Promise((resolve,reject)=>{
            try{
                db.get().collection(collection.ORDER_COLLECTION)
                .updateOne({_id:ObjectId(details.order)},
                {
                    $set:{status:"Returned"}   
    
                }
                ).then(async(response)=>{
    
                    let prod=await db.get().collection(collection.ORDER_COLLECTION).findOne({_id:ObjectId(details.order)},{
                        projection:{'products.item':true,'products.quantity':true}
                    })
                    let prodArr=prod.products
                    prodArr.forEach(async(element)=>{
                        let quan=element.quantity
                        await db.get().collection(collection.PRODUCT_COLLECTION).updateOne({_id:ObjectId(element.item)},[
                            {
                            $set:{stock:{$add:['$stock',quan]}}
                            }
                        ])
                    })
                    resolve({status:true})
                })
            }catch(e){
                console.log(e);
                resolve({status:false})
            }
        })
    },
    generateRazorpay:(orderId,total)=>{
        return new Promise(async(resolve,reject)=>{
            try{
                let order=await instance.orders.create({
                    amount: total*100,
                    currency: "INR",
                    receipt: ""+orderId,
                    notes: {
                      key1: "value3",
                      key2: "value2"
                    }
                  })
                  resolve(order)
            }catch(e){
                console.log(e);
                resolve(null)
            }
        })
    },
    verifyPayment:(details)=>{
        return new Promise(async(resolve,reject)=>{
            try{
                const {createHmac} = await import('node:crypto');
                let hmac = createHmac('sha256', 'u461lMkrPyYwhfhuGMuAif3r');
    
                hmac.update(details['payment[razorpay_order_id]']+'|'+details['payment[razorpay_payment_id]']);
                hmac=hmac.digest('hex')
                if(hmac==details['payment[razorpay_signature]']){
                    resolve()
                }else{
                    reject()
                }
            }catch(e){
                console.log(e)
                reject()
            }
        })
    },
    changeOnlinePaymentStatus:(orderId)=>{
        return new Promise(async(resolve,reject)=>{
            try{
                db.get().collection(collection.ORDER_COLLECTION)
                .updateOne({_id:ObjectId(orderId)},
                {
                    $set:{status:"Placed"}   
                }).then(()=>{
                    resolve()
                })
            }catch(e){
                console.log(e)
                resolve()
            }
        })
    },
    updateUser:(userId,userData)=>{
        return new Promise(async(resolve,reject)=>{
            try{
                userData.phone=parseInt(userData.phone)
                userData.pincode=parseInt(userData.pincode)
                await db.get().collection(collection.USER_COLLECTION)
                .updateOne({_id:ObjectId(userId)},{
                    $set:{
                        name:userData.name,
                        email:userData.email,
                        phone:userData.phone
                    }
                }).then((response)=>{
                    resolve(response)
                })
            }catch(e){
                console.log(e);
                resolve({status:false})
            }
        })
    },
    getOneUser:(userId)=>{
        return new Promise((resolve,reject)=>{
            db.get().collection(collection.USER_COLLECTION).findOne({_id:ObjectId(userId)}).then((userData)=>{
                resolve(userData)
            })
        })
    },
    checkPassword:(userId,userData)=>{
        return new Promise(async(resolve,reject)=>{
            try{
                let response={}
                let user=await db.get().collection(collection.USER_COLLECTION).findOne({_id:ObjectId(userId)})
                if(user){
                    bcrypt.compare(userData.password,user.password).then((status)=>{
                        if(status){
                            response.status=true
                            bcrypt.compare(userData.newPassword,user.password).then(async(data)=>{
                                if(data){
                                    response.data=true
                                    resolve(response)
                                }else{
                                    userData.newPassword=await bcrypt.hash(userData.newPassword,10)
                                    await db.get().collection(collection.USER_COLLECTION).updateOne({_id:ObjectId(userId)},
                                    {
                                        $set:{
                                            password:userData.newPassword
                                        }
                                    }).then(()=>{
                                        resolve(response)
                                    })
                                }
                            })                        
                        }else{
                            resolve({status:false})
                        }
                    })
                }else{
                    resolve({status:false})  
                }
            }catch(e){
                console.log(e);
                resolve({status:false})
            }
            
        })
    },
    createPay:(payment)=>{
        return new Promise( ( resolve , reject ) => {
            try{
                paypal.payment.create( payment , function( err , payment ) {
                    if ( err ) {
                        reject(err); 
                    }
                   else {
                       resolve(payment); 
                   }
                   });
            }catch(e){
                console.log(e);
                reject(e)
            }
        });
    },
    addAddress:(userId,details)=>{
        return new Promise(async( resolve , reject ) => {
            try{
                let count=uid()
                let addressObj={
                    id:count,       
                    name:details.name,
                    mobile:details.phone,
                    email:details.email,
                    address:details.address,
                    state:details.state,
                    pincode:details.pincode
                }
                db.get().collection(collection.USER_COLLECTION)
                .updateOne({_id:ObjectId(userId)},
                {
                    $push:{addresses:addressObj}
                }).then((response)=>{
                    resolve()
                })
            }catch(e){
                console.log(e);
                resolve()
            }
        })
    },
    getAddresses:(userId)=>{
        return new Promise(async( resolve , reject ) => {
            let addressDetails=await db.get().collection(collection.USER_COLLECTION)
            .aggregate([
                {
                    
                    $match:{_id:ObjectId(userId)}
                },
                {
                    $unwind:'$addresses' 
                },
                {
                    $project:{
                        id:'$addresses.id',
                        name:'$addresses.name',
                        mobile:'$addresses.mobile',
                        email:'$addresses.email',
                        address:'$addresses.address',
                        state:'$addresses.state',
                        pincode:'$addresses.pincode',
                    }
                }
            ]).toArray()
            resolve(addressDetails)
        })
    },
    getOneCartProduct:(userId,proId)=>{
        return new Promise(async(resolve,reject)=>{
            try{
                let cartItems=await db.get().collection(collection.CART_COLLECTION).aggregate([
                    {
                        $match:{user:ObjectId(userId)}
                    },
                    {
                        $unwind:'$products'
                    },
                    {
                        $project:{
                            item:'$products.item',
                            quantity:'$products.quantity',
                            price:'$products.price'
                        }
                    },{
                        $lookup:{
                            from:collection.PRODUCT_COLLECTION,
                            localField:'item',
                            foreignField:'_id',
                            as:'product'
                        }
                    },
                    { 
                        $match:{item:ObjectId(proId)}  
                    }, 
                    {
                        $project:{
                            item:1,quantity:1,price:1,product:{$arrayElemAt:['$product',0]}
                        }
                    }
                ]).toArray()
                if(cartItems.length===0){
                    resolve()
               }else{
                    console.log(cartItems)    
                   resolve(cartItems)  
               }
            }catch(e){
                console.log(e);
                resolve()
            }  
        })
    },
    getCartOneProductList:(userId,proId)=>{
        return new Promise(async(resolve,reject)=>{
            try{
                let cart=await db.get().collection(collection.CART_COLLECTION)
                .aggregate([
                    {
                        $match:{user:ObjectId(userId)}
                    },
                    {
                        $unwind:'$products'
                    },
                    {
                        $project:{
                            user:'$user',
                            products:'$products',
                            item:'$products.item',
                            quantity:'$products.quantity',
                            price:'$products.price'
                        }
                    },
                    {
                        $match:{item:ObjectId(proId)}
                    },
                    {
                        $project:{
                            user:'$user',
                            products:['$products'],
                        }
                    }
                ]).toArray()
                console.log(cart)
                if(cart.length===0){
                    resolve({status:true})
                }else{
                    resolve(cart[0].products)  
                } 
            }catch(e){
                console.log(e);
                resolve({status:false})
            }
        })
    },
    updateOneProductTotal:(userId,details,total)=>{
        return new Promise((resolve,reject)=>{
            try{
                db.get().collection(collection.CART_COLLECTION)
                .updateOne({user:ObjectId(userId),'products.item':ObjectId(details.product)},
                {
                    $set:{'products.$.price':total}   
                }
                ).then(()=>{
                    resolve()
                })
            }catch(e){
                console.log(e);
                resolve()
            }
        })
    },
    fetchProductPrice:(proId)=>{
        return new Promise(async(resolve,reject)=>{
            db.get().collection(collection.PRODUCT_COLLECTION).findOne({_id:ObjectId(proId)}).then((proDetail)=>{
                resolve(proDetail.price)  
            })
        })
    },
    updateQuantityAndPriceBuyNow:(userId,productPrice,proId)=>{
        return new Promise((resolve,reject)=>{
            try{
                db.get().collection(collection.CART_COLLECTION)
                .updateOne({user:ObjectId(userId),'products.item':ObjectId(proId)},
                {
                    $set:{'products.$.price':productPrice,'products.$.quantity':1}   
                }
                ).then(()=>{
                    resolve()
                })
            }catch(e){
                console.log(e);
                resolve()
            }
        })
    },
    fetchUserCount:()=>{
        return new Promise(async(resolve,reject)=>{
            db.get().collection(collection.USER_COLLECTION).count().then((userCount)=>{
                resolve(userCount)
            })
        })
    },
    fetchNoOfOrders:()=>{
        return new Promise(async(resolve,reject)=>{
            db.get().collection(collection.ORDER_COLLECTION).find({status:'Delivered'}).count().then((NoOfOrders)=>{
                resolve(NoOfOrders)
            })
        })
    },
    allCount:() => {
        let response={}
        return new Promise(async (resolve, reject) => {
            try{
                let delivered = await db.get().collection(collection.ORDER_COLLECTION).aggregate([
                    {
                        $match: { status: "Delivered" }
                    },
                    {
                        $group:
                        { _id: { month1: { $month: { $toDate: "$date" } } }, count: { $sum: 1 } }
                    },
                    {
                        $sort:{"_id.month1": -1}
                    }
                ]).toArray()
                if(delivered[0]){
                    response.deliveredCount=delivered[0].count
                }
    
                let cancelled = await db.get().collection(collection.ORDER_COLLECTION).aggregate([
                    {
                        $match: { status: "Cancelled" }
                    },
                    {
                        $group:
                        { _id: { month2: { $month: { $toDate: "$date" } } }, count: { $sum: 1 } }
                    },
                    {
                        $sort:{"_id.month2": -1}
                    }
                ]).toArray()
                if(cancelled[0]){
                    response.cancelledCount=cancelled[0].count
                }
                
                let placed = await db.get().collection(collection.ORDER_COLLECTION).aggregate([
                    {
                        $match: { status: "Placed" }
                    },
                    {
                        $group:
                            { _id: { month3: { $month: { $toDate: "$date" } } }, count: { $sum: 1 } }
                    },{
                        $sort:{"_id.month3": -1}
                    }
                ]).toArray()
                response.placedCount=placed[0].count
    
                let returned = await db.get().collection(collection.ORDER_COLLECTION).aggregate([
                    {
                        $match: { status: "Returned" }
                    },
                    {
                        $group:
                            { _id: { month4: { $month: { $toDate: "$date" } } }, count: { $sum: 1 } }
                    },
                    {
                        $sort:{"_id.month4": -1}
                    }
                ]).toArray()
                if(returned[0]){
                    response.returnedCount=returned[0].count
                }
                resolve(response)

            }
            catch(e){
                console.log(e)
                resolve({status:false})
            }  
        })
    },
    fetchSales:()=>{
        return new Promise(async (resolve, reject) => {
            try{
                let sale = await db.get().collection(collection.ORDER_COLLECTION).aggregate([
                    {
                        $match: { status: "Delivered" }
                    },
                    {
                        $group:
                        { _id: { month: { $month: { $toDate: "$date" } } }, total: { $sum: '$totalAmount' } }
                    },
                    {
                        $sort:{"_id.month": 1}
                    },
                    {
                        $project:{_id:0,total:1}
                    }
                ]).toArray()
                if(sale){
                    resolve(sale)
                }else{
                    resolve({status:true})
                }
            }catch(e){
                console.log(e);
                resolve({status:false})
            }
        })
    },
    fetchMonth:()=>{
        return new Promise(async (resolve, reject) => {
            try{
                let monthNumber = await db.get().collection(collection.ORDER_COLLECTION).aggregate([
                    {
                        $match: { status: "Delivered" }
                    },
                    {
                        $group:
                        { _id: { month: { $month: { $toDate: "$date" } } } }
                    },
                    {
                        $sort:{"_id.month": 1}
                    },
                    {
                        $project:{_id:0,month:'$_id.month'}
                    }
                ]).toArray()
                monthNumber.forEach(element => {
                    function toMonthName(monthNumber) {
                        const date = new Date();
                        date.setMonth(monthNumber - 1);
                        return date.toLocaleString('en-US', {
                          month: 'long',
                        });
                    }
                    element.month=toMonthName(element.month)
                });
                resolve(monthNumber)
            }catch(e){
                console.log(e);
                resolve({status:false})
            }
        })
    },
    fetchYearAndMonthSale:()=>{
        return new Promise(async (resolve, reject) => {
            try{
                let response={}
                let yearSale = await db.get().collection(collection.ORDER_COLLECTION).aggregate([
                    {
                        $match: { status: "Delivered" }
                    },
                    {
                        $group:
                        { _id: { year: { $year: { $toDate: "$date" } } }, total: { $sum: '$totalAmount' } }
                    },
                    {
                        $sort:{"_id.year": -1}
                    }
                ]).toArray()
                if(yearSale[0]){
                    console.log(yearSale)
                    response.yearSale=yearSale[0].total
                }
                 
                let monthSale = await db.get().collection(collection.ORDER_COLLECTION).aggregate([
                    {
                        $match: { status: "Delivered" }
                    },
                    {
                        $group:
                        { _id: { month: { $month: { $toDate: "$date" } } }, total: { $sum: '$totalAmount' } }
                    },
                    {
                        $sort:{"_id.month": -1}
                    }
                ]).toArray()
                if(monthSale[0]){
                    console.log(monthSale)
                    response.monthSale=monthSale[0].total
                }
    
                resolve(response)
            }catch(e){
                console.log(e);
                resolve({status:false})
            }
        })
    },
    getCustomOrdersList:()=>{
        return new Promise(async (resolve, reject) => {
            db.get().collection(collection.ORDER_COLLECTION).find().toArray().then((order)=>{
                resolve(order.reverse())
            })
        })
    },
    cancelOrder:(details)=>{  
        return new Promise((resolve,reject)=>{
            try{
                db.get().collection(collection.ORDER_COLLECTION)
                .updateOne({_id:ObjectId(details.order)},
                {
                    $set:{status:"Cancelled"}   
    
                }
                ).then(async(response)=>{
                    let prod=await db.get().collection(collection.ORDER_COLLECTION).findOne({_id:ObjectId(details.order)},{
                        projection:{'products.item':true,'products.quantity':true}
                    })
                    let prodArr=prod.products
                    prodArr.forEach(async(element)=>{
                        let quan=element.quantity
                        await db.get().collection(collection.PRODUCT_COLLECTION).updateOne({_id:ObjectId(element.item)},[
                            {
                            $set:{stock:{$add:['$stock',quan]}}
                            }
                        ])
                    })
                    resolve({status:true})
                })
            }catch(e){
                console.log(e);
                resolve({status:false})
            }
        })
    },
    getDetailsOfOrderedProducts:(orderId)=>{
        return new Promise(async(resolve,reject)=>{
            try{
                let orderItems=await db.get().collection(collection.ORDER_COLLECTION).aggregate([
                    {
                        $match:{_id:ObjectId(orderId)}
                    },
                    {
                        $unwind:'$products'
                    },
                    {
                        $project:{
                            item:'$products.item',
                            quantity:'$products.quantity',
                            price:'$products.price'
                        }
                    },{
                        $lookup:{
                            from:collection.PRODUCT_COLLECTION,
                            localField:'item',
                            foreignField:'_id',
                            as:'product'
                        }
                    },
                    {
                        $project:{
                            item:1,quantity:1,price:1,product:{$arrayElemAt:['$product',0]}
                        }
                    }
                ]).toArray()
                
                if(orderItems.length===0){
                    resolve()   
               }else{
                   console.log(orderItems)
                   resolve(orderItems)  
               }
            }catch(e){
                console.log(e);
                resolve({status:false})
            }
        })
    },
    update100:(referral,newUser)=>{
        return new Promise(async(resolve,reject)=>{
            try{
                let transId=uid()
                let date=new Date().toLocaleString('en-US')
                let desc="For referring "+newUser
                transactionObj={
                    id:transId,
                    date:date,
                    description:desc,
                    amount:100,
                    payment:"Credited"
                }
                await db.get().collection(collection.WALLET_COLLECTION)
                .updateOne({referralCode:referral},
                {
                    $inc:{balance:100},
                    $push:{transaction:transactionObj}
                }
                )
                resolve()
            }catch(e){
                console.log(e);
                resolve()
            }
        })
    },
    update50:(userid)=>{
        return new Promise(async(resolve,reject)=>{
            try{
                let transId=uid()
                let date=new Date().toLocaleString('en-US')
                let desc="Referral Claimed"
                transactionObj={
                    id:transId,
                    date:date,
                    description:desc,
                    amount:50,
                    payment:"Credited"
                }
                await db.get().collection(collection.WALLET_COLLECTION)
                .updateOne({userId:ObjectId(userid)},  
                {
                    $set:{balance:50},
                    $push:{transaction:transactionObj}
                }
                )
                resolve()
            }catch(e){
                console.log(e);
                resolve()
            }
        })
    },
    getWalletInfo:(userid)=>{
        return new Promise(( resolve , reject ) => {
            db.get().collection(collection.WALLET_COLLECTION).find({userId:ObjectId(userid)}).toArray().then((walletDetails)=>{
                resolve(walletDetails)
            })
        })
    },
    CheckWalletBalance:(userid,total)=>{
        return new Promise(async( resolve , reject ) => {
            let insufficient=await db.get().collection(collection.WALLET_COLLECTION).findOne({userId:ObjectId(userid),balance:{$lt:total}})
            if(insufficient){
                resolve({insufficient:true})
            }else{
                resolve({insufficient:false})
            }
        })

    },
    reduceFromWallet:(userid,total,orderId)=>{
        return new Promise(async( resolve , reject ) => {
            try{
                let transId=uid()
                let date=new Date().toLocaleString('en-US')
                let desc="Product Purchased "
                transactionObj={
                    id:transId,
                    date:date,
                    description:desc,
                    amount:total,
                    payment:"Debited"
                }
                await db.get().collection(collection.WALLET_COLLECTION)
                .updateOne({userId:ObjectId(userid)},
                {
                    $inc:{balance:-total},
                    $push:{transaction:transactionObj}
                }
                )
                await db.get().collection(collection.ORDER_COLLECTION)
                .updateOne({_id:ObjectId(orderId)},
                {
                    $set:{status:"Placed"}   
    
                })
                resolve()
            }catch(e){
                console.log(e);
                resolve()
            }
        })
    },
    createCoupon:(couponData)=>{
        return new Promise(async( resolve , reject ) => {
            try{
                let coupon=await db.get().collection(collection.COUPON_COLLECTION).findOne({couponName:couponData.couponName})
                if(coupon){
                    resolve({couponExist:true})
                }else{
                    couponData.minAmount=parseInt(couponData.minAmount)
                    couponData.percentage=parseInt(couponData.percentage)
                    db.get().collection(collection.COUPON_COLLECTION).insertOne(couponData).then(()=>{
                        resolve({status:true})
                    })
                } 
            }catch(e){
                console.log(e);
                resolve({status:false})
            } 
        })
    },
    getCoupon:()=>{
        return new Promise((resolve,reject)=>{
            db.get().collection(collection.COUPON_COLLECTION).find().toArray().then((coupon)=>{
                resolve(coupon.reverse())
            })
        })
    },
    removeCoupon:(couponId)=>{
        return new Promise((resolve,reject)=>{
            db.get().collection(collection.COUPON_COLLECTION).deleteOne({_id:ObjectId(couponId)}).then(()=>{
                resolve({status:true})
            })
        })
    },
    verifyCoupon:(coupon)=>{
        return new Promise(async(resolve,reject)=>{
            db.get().collection(collection.COUPON_COLLECTION).findOne({couponName:coupon}).then((couponData)=>{
                if(couponData){  
                    couponData.couponVerified=true
                    resolve(couponData)
                }else{
                    resolve({couponVerified:false})
                }
            })
        })
    },
    removeAddress:(addressId,userId)=>{
        return new Promise((resolve,reject)=>{
            try{
                db.get().collection(collection.USER_COLLECTION)
                .updateOne({_id:ObjectId(userId)},
                {
                    $pull:{addresses:{id:addressId}}
                }
                ).then(()=>{
                    resolve(true)
                })
            }catch(e){
                console.log(e);
                resolve(false)
            }
        })
    },
    refundAmount:(userid,details,data)=>{
        return new Promise(async(resolve,reject)=>{
            try{
                let total=parseInt(details.total)
                let transId=uid()
                let date=new Date().toLocaleString('en-US')
                if(data.returnTrue){
                    desc="product Returned"
                }else if(data.cancelTrue){
                    desc="Order Cancelled"
                }
                transactionObj={
                    id:transId,
                    date:date,
                    description:desc,
                    amount:total,
                    payment:"Credited"
                }
                await db.get().collection(collection.WALLET_COLLECTION)
                .updateOne({userId:ObjectId(userid)},
                {
                    $inc:{balance:total},
                    $push:{transaction:transactionObj}
                }
                )
                resolve()
            }catch(e){
                console.log(e);
                resolve()
            }
        })
    },
    createCategoryOffer:(offerData)=>{
        return new Promise(async(resolve,reject)=>{
            try{
                let offerName=await db.get().collection(collection.OFFER_COLLECTION).findOne({name:offerData.name,type:'category'})
                let offercategory=await db.get().collection(collection.OFFER_COLLECTION).findOne({category:offerData.category,type:'category'})
                if(offerName){
                    offerName.offerNameExist=true
                    resolve(offerName)
                }else if(offercategory){
                    offercategory.categoryOfferExist=true
                    resolve(offercategory)
                }
                else{
                    offerData.percentage=parseInt(offerData.percentage)
                    let perc=offerData.percentage
                   await db.get().collection(collection.PRODUCT_COLLECTION).updateMany({category:offerData.category},[
                        {
                            $set:{
                                price:{$subtract:['$mrp',{$floor:{$multiply:[{$divide:[perc,100]},'$mrp']}}]},
                                offerName:offerData.name,
                                offerType:'category'
                            }
                        },
                    ])
    
                    db.get().collection(collection.OFFER_COLLECTION).insertOne(offerData).then(()=>{
                        resolve({status:true})
                    })
                }
            }catch(e){
                console.log(e);
                resolve({status:false})
            }
        })
    },
    createProductOffer:(offerData)=>{
        return new Promise(async(resolve,reject)=>{
            try{
                let offerName=await db.get().collection(collection.OFFER_COLLECTION).findOne({name:offerData.name,type:'product'})
                if(offerName){
                    offerName.productOfferExist=true
                    resolve(offerName)
                }else{
                    offerData.percentage=parseInt(offerData.percentage)
                    db.get().collection(collection.OFFER_COLLECTION).insertOne(offerData).then(()=>{
                        resolve({status:true})
                    })
                }
            }catch(e){
                console.log(e);
                resolve({status:false})
            }
        })
    },
    getCategoryOffer:()=>{
        return new Promise(async(resolve,reject)=>{
            db.get().collection(collection.OFFER_COLLECTION).find({type:'category'}).toArray().then((offer)=>{
                try{
                    resolve(offer.reverse())
                }catch(e){
                    console.log(e)
                    resolve({status:false})
                }
            })
            
        })
    },
    getProductOffer:()=>{
        return new Promise(async(resolve,reject)=>{
            db.get().collection(collection.OFFER_COLLECTION).find({type:'product'}).toArray().then((offer)=>{
                try{
                    resolve(offer.reverse())
                }catch(e){
                    console.log(e)
                    resolve({status:false})
                }
            })
           
        })
    },
    removeCategoryOffer:(catOffData)=>{
        return new Promise(async(resolve,reject)=>{
            try{
                await db.get().collection(collection.PRODUCT_COLLECTION).updateMany({category:catOffData.offCategory,offerType:'category'},[
                    {
                        $set:{price: '$mrp'},
                    },
                    {
                        $unset:["offerType","offerName"]
                    }
                ])
                db.get().collection(collection.OFFER_COLLECTION).deleteOne({_id:ObjectId(catOffData.offerId),type:'category'}).then(()=>{
                    resolve({status:true})
                })
            }catch(e){
                console.log(e);
                resolve({status:false})
            }
        })
    },
    removeProductOffer:(offer)=>{
        return new Promise(async(resolve,reject)=>{
            try{
                await db.get().collection(collection.PRODUCT_COLLECTION).updateMany({offerName:offer.productOfferName,offerType:'product'},[
                    {
                        $set:{price: '$mrp'},
                    },
                    {
                        $unset:["offerType","offerName"]
                    }
                ])
           
                db.get().collection(collection.OFFER_COLLECTION).deleteOne({_id:ObjectId(offer.productOfferId),type:'product'}).then(()=>{
                    console.log("--offer delete cheythu");
                    resolve({status:true})
                })
            }catch(e){
                console.log(e);
                resolve({status:false})
            }
        })
    },
    applyProductOffer:(proData)=>{
        return new Promise(async(resolve,reject)=>{
            try{
                if(proData.offerName){
                    let offerData=await db.get().collection(collection.OFFER_COLLECTION).findOne({name:proData.offerName,type:'product'})
                    offerData.percentage=parseInt(offerData.percentage)
                    let perc=offerData.percentage
                    await db.get().collection(collection.PRODUCT_COLLECTION).updateOne({_id:ObjectId(proData.proId)},[
                        {
                            $set:{
                                price:{$subtract:['$mrp',{$floor:{$multiply:[{$divide:[perc,100]},'$mrp']}}]},
                                offerName:proData.offerName,
                                offerType:'product'
                            }
                        }
                    ])
                    resolve({status:true})
                }else{
                    resolve({status:false})
                }
            }catch(e){
                console.log(e);
                resolve({status:false})
            } 
        })
    },
    getOrderForInvoice:(orderId)=>{
        return new Promise(async(resolve,reject)=>{
            try{
                let orderItems=await db.get().collection(collection.ORDER_COLLECTION).aggregate([
                    {
                        $match:{_id:ObjectId(orderId)}
                    },
                    {
                        $unwind:'$products'
                    },
                    {
                        $project:{
                            item:'$products.item',
                            quantity:'$products.quantity',
                            pricetotal:'$products.price',
                            brand:'$products.brand',
                            model:'$products.model'
                        }
                    },{
                        $lookup:{
                            from:collection.PRODUCT_COLLECTION,
                            localField:'item',
                            foreignField:'_id',
                            as:'product'
                        }
                    },
                    {
                        $project:{
                            product:{$arrayElemAt:['$product',0]},
                            _id:0,brand:1,model:1,quantity:1,pricetotal:1
                        }
                    },
                    {
                        $project:{
                            description:'$product.description',
                            price:'$product.price',
                            brand:1,model:1,quantity:1,pricetotal:1
                            
                        }
                    },
                    {
                        $project:{
                            brand:1,model:1,description:1,quantity:1,price:1,pricetotal:1
                        }
                    }
                ]).toArray()
                if(orderItems.length===0){
                    resolve({status:false})
               }else{
                   resolve(orderItems)  
               } 
            }catch(e){
                console.log(e);
                resolve({status:false})
            }
        })
    },
    getreferralCode:(userid)=>{  
        return new Promise(async(resolve,reject)=>{
            db.get().collection(collection.WALLET_COLLECTION).findOne({userId:ObjectId(userid)}).then((Data)=>{
                try{
                    resolve(Data)
                }
                catch(e){
                    console.log(e)
                }  
            })
            })
    },
    getOrderAddressDetails:(orderId)=>{
        return new Promise(async(resolve,reject)=>{
            let order=await db.get().collection(collection.ORDER_COLLECTION).findOne({_id:ObjectId(orderId)})
            resolve(order)
        })
    },
    checkCart:(userid,proid)=>{
        return new Promise(async(resolve,reject)=>{
            let validcart=await db.get().collection(collection.CART_COLLECTION).findOne({user:ObjectId(userid),'products.item':ObjectId(proid)})
            if(validcart){
                resolve({itemIsThere:true})
            }else{
                resolve({itemIsThere:false})
            }
        })
    },
    updateAddress:(userid,Data)=>{
        return new Promise((resolve,reject)=>{
            try{
                db.get().collection(collection.USER_COLLECTION)
                .updateOne({_id:ObjectId(userid),'addresses.id':Data.id},
                {
                    $set:{
                        'addresses.$.name':Data.name,
                        'addresses.$.mobile':Data.phone,
                        'addresses.$.email':Data.email,
                        'addresses.$.address':Data.address,
                        'addresses.$.state':Data.state,
                        'addresses.$.pincode':Data.pincode,
                    }   
                }
                ).then(()=>{
                    resolve()
                })
            }catch(e){
                console.log(e);
                resolve()
            }
        })
    },
    addToWishlist:(proid,userid)=>{
           return new Promise(async(resolve,reject)=>{
            console.log("proId-----");
            console.log(proid);
            console.log("userid--------");
            console.log(userid);
            let wishobj={
                item:ObjectId(proid)
               }
               console.log("Entered in addtowishlist userhelper");
            let wishlist=await db.get().collection(collection.WISHLIST_COLLECTION).findOne({user:ObjectId(userid)})
            if(wishlist){
                db.get().collection(collection.WISHLIST_COLLECTION).updateOne({user:ObjectId(userid)},
                {
                    $addToSet:{products:wishobj}
                }
           ).then(()=>{
            resolve()
           })
            }
            else{
                let wishlistobj={
                    user:ObjectId(userid),
                    products:[wishobj]
                }
                db.get().collection(collection.WISHLIST_COLLECTION).insertOne(wishlistobj).then(()=>{
                    resolve()
                })
            }
           })
    },
    getWishList:(uid)=>{
        return new Promise(async(resolve,reject)=>{
           let wishlistItems=await db.get().collection(WISHLIST_COLLECTION).aggregate([
            {
                $match:{user:ObjectId(uid)}
            },
            {
                $unwind:'$products'
            },
            {
                $project:{
                    item:'$products.item'
                }
            },
            {
                $lookup:{
                    from:'products',
                    localField:'item',
                    foreignField:'_id',
                    as:'products'
                }
            },
            {
                $project:{
                    item:1,products:{$arrayElemAt:['$products',0]}
                }
            },
            
           ]).toArray()

           resolve(wishlistItems.reverse())
        })
    },
    removeWish:(details)=>{
        return new Promise((resolve,reject)=>{
            try{
                db.get().collection(collection.WISHLIST_COLLECTION)
                .updateOne({_id:ObjectId(details.wish)},
                {
                    $pull:{products:{item:ObjectId(details.product)}}
                }
                ).then(()=>{
                    resolve(true)
                })
            }catch(e){
                console.log(e);
                resolve(false)
            }
        })
    },
    
    getWishCount:(userId)=>{
        return new Promise(async(resolve,reject)=>{
            let count=0
            let cart=await db.get().collection(collection.WISHLIST_COLLECTION).findOne({user:ObjectId(userId)})
            if(cart){
                count=cart.products.length
            }
            console.log(cart)
            resolve(count)
        })
    },

  



    addBanner:(banner)=>{
        return new Promise(async(resolve,reject)=>{
            let bannerExist =await db.get().collection(collection.BANNER_COLLECTION).find().toArray()
            console.log('Find Banner Result \n', bannerExist)
            if (bannerExist.length!=0) {
                db.get().collection(collection.BANNER_COLLECTION).updateOne({},{
                    $set:{
                
                        name : banner.name,
                        banner : banner.banner,
                    }
                }).then((response)=>{
                    console.log(response)
                    resolve()
                }).catch((error)=>{
                    console.log(error)
                })
            } else {
                db.get().collection(collection.BANNER_COLLECTION).insertOne(banner).then(()=>{
                    console.log(response)
                    resolve()
                })
            }            
        })
    },
  




    
    //   addBanner: (banner) => {   

    //     return new Promise(async (resolve, reject) => {
    //       let data = await db.get().collection(collection.BANNER_COLLECTION).insertOne(banner)
    //       resolve()
    //       // console.log(data)
    //     })
    //   },


      getbanner:()=>{
        return new Promise(async(resolve,reject)=>{
            db.get().collection(collection.BANNER_COLLECTION).find().toArray().then((banner)=>{
                try{
                    console.log("userhelper getbanner all ok");
                    console.log(banner);
                    resolve(banner)
                }catch(e){
                    console.log(e)
                    reject()
                }
            })
        })
    }     


}
