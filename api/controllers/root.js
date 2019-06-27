'use strict';

//contrib
var express = require('express');
var router = express.Router();
var winston = require('winston');
var jwt = require('express-jwt');
var _ = require('underscore');
var async = require('async');
var axios = require('axios');

//mine
var config = require('../../config');
var common = require('./common');
var logger = new winston.Logger(config.logger.winston);
var db = require('../models');
var profile = require('../profile');

/**
 * @api {get} /health Get current service status
 * @apiName Health
 * @apiGroup System
 *
 * @apiSuccess {String} status 'ok' or 'failed'
 */
router.get('/health', function(req, res, next) {
    res.json({status: 'ok'});
});

router.get('/config', jwt({secret: config.express.jwt.pub, credentialsRequired: false}), function(req, res) {
    var conf = {
        //service_types: config.service_types,
        //defaults: config.defaults,
        //menu: get_menu(req.user),
    };
    res.json(conf);
});

router.get('/acl/:key', jwt({secret: config.express.jwt.pub/*, credentialsRequired: false*/}), function(req, res, next) {
    if(!~req.user.roles.indexOf('admin')) return next(new Error("admin only"));
    db.Acl.find({}, function(err, acl) {
        if(err) return next(err);
        if(!acl) return res.json({});
        res.json(acl);
    });
});

router.put('/acl/:key', jwt({secret: config.express.jwt.pub/*, credentialsRequired: false*/}), function(req, res, next) {
    if(!~req.user.roles.indexOf('admin')) return next(new Error("admin only"));
    var update_cnt = 0;
    async.eachOf(req.body, function(acl, iibisid, callback) {
        //console.log(iibisid);
        //console.log(acl);
        db.Acl.findOneAndUpdate({IIBISID: iibisid}, acl, {upsert:true}, function(err, doc){
            if (err) return next(err);
            update_cnt++;
            callback()
        });
    }, function(err) {
        if (err) return next(err);
        res.json({status: "ok", msg: update_cnt + " ACLs updated"});
    });
});

router.get('/profiles', jwt({secret: config.express.jwt.pub}), function(req, res, next) {
    res.json(profile.getall());
});

router.get('/stats', function(req, res, next) {
    db.Image.count({}, function(err, img_cnt){
        if (err) return next(err);
        db.Exam.distinct('subject', function(err, subject_ids){
            if (err) return next(err);
            var subj_cnt = subject_ids.length;
            db.Research.aggregate([
                {$group:{"_id":"$Modality","IIBISIDS":{$addToSet:"$IIBISID"}}},
                {$project:{"Modality":"$_id","_id":0,"count":{$size:"$IIBISIDS"}}}
            ], function(err, res_cnts) {
                if (err) return next(err);
                res.json({images: img_cnt, subjects: subj_cnt, researches: res_cnts});
            });
        });
    });
});


///////////////////AUTH//////////////////////
/////////////////////////////////////////////


router.get('/verify', function(req, res, next) {
    var ticket = req.query.casticket;

    //guess casurl using referer - TODO - should I use cookie and pass it from the UI method begin_iucas() instead?
    //var casurl = config.iucas.home_url;
    if(!req.headers.referer) return next("Referer not set in header..");
    var casurl = req.headers.referer;
    axios.get('https://cas.iu.edu/cas/validate?cassvc=IU&casticket='+ticket+'&casurl='+casurl, {
        timeout: 2000,
        // headers: {'Connection': 'close'},
        // httpsAgent: new https.Agent({ keepAlive: false }),
    })
        .then(function(response) {

            // if(response.headers['content-length'] > response.request._response.length){
            //     response.__incomplete = true;
            //     logger.error("INCOMPLETE RESPONSE");
            // }
            logger.info("verify responded", response.status, response.data);

            if (response.status == 200) {
                var reslines = response.data.split("\n");
                // console.log(reslines);
                if(reslines[0].trim() == "yes") {
                    var uid = reslines[1].trim();

                    db.User.findOne({username: uid}).exec(function(err, user) {
                        if(err) return next(err);
                        if(!user) {
                            common.create_user(uid, next, function(err, _user) {
                                if(err) return next(err);
                                common.issue_jwt(_user, function (err, jwt) {
                                    if (err) return next(err);
                                    res.json({jwt: jwt, uid: uid, role: _user.primary_role});
                                });
                            })
                        } else {
                            user.lastLogin = Date.now();
                            user.save();
                            common.issue_jwt(user, function (err, jwt) {
                                if (err) return next(err);
                                res.json({jwt: jwt, uid: uid, role: user.primary_role});
                            });
                        }
                    });
                } else {
                    logger.error("IUCAS failed to validate");
                    res.sendStatus("403");//Is 403:Forbidden appropriate return code?
                }
            } else {
                //non 200 code...
                next(response.data);
            }
        })
        .catch(function(thrown) {
            if (axios.isCancel(thrown)) {
                console.log('Request canceled', thrown.message);
            } else {
                return next(thrown);
            }
        })
});


module.exports = router;

