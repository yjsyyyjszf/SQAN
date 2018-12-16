#!/usr/bin/node
'use strict';

const _ = require('underscore'); 
var async = require('async');

//const config = require('../../config');
const db = require('../models');
const events = require('../events');

//connect to db and start processing batch indefinitely
db.init(function(err) {
    if(err) throw err;
});

function qc_series(series,images,template,cb) {

    console.log("QC-ing series: "+series._id + " -- series description " +series.series_desc);

    var all_qced = true;
    //var errored_InstanceNumber = [];
    var template_mismatch = 0;  // number of fields with template_mismatch error
    var not_set = 0;  // number of fields with not_set error
    var image_tag_mismatch = 0;  // number of tags found in image but not in templates
    var diff = 0;
    var warnings = 0;

    var qc = {
        series_image_count: images.length,  //number of images in this series
        clean: 0, //number of images with no problems
        errored_images: 0,  // number of images with errors
        series_field_count: 0, // number of fields across all images
        series_fields_errored: 0,  // number of fields that errored across entire series
        template_field_count: 0,
        template_image_count: undefined,

        template_id: template._id, //template set used to do qc for this series (sampled from one images's qc.template_id)
        date: new Date(), //series-qc time

        //series-qc errros / warnings / notemp count
        errors: [], 
        warnings: [],
        notemps: 0, 
    }

    images.forEach(function(image) {
        if(image.qc) {
            if(image.qc.notemp) {
                qc.notemps++;
            } else {
                qc.series_field_count += image.qc.error_stats.image_field_count;
                qc.template_field_count += image.qc.error_stats.template_field_count;
                // image has errors
                if(image.qc.errors.length > 0) {
                    //errored_InstanceNumber.push(image.InstanceNumber);
                    qc.errored_images++;
                    template_mismatch +=  image.qc.error_stats.template_mismatch;
                    not_set += image.qc.error_stats.not_set;
                    image_tag_mismatch += image.qc.error_stats.image_tag_mismatch;
                }
                // image has warnings
                if(image.qc.warnings.length > 0) {
                    warnings++;
                } 
                //image is clean
                if(image.qc.errors.length == 0 && image.qc.warnings.length == 0) {
                    qc.clean++;
                }
            }
        } else {
            all_qced = false;
        }
    });

    //if there is an image that's not yet qc-ed, series cannot be qc-ed.
    if(!all_qced) {
        console.log("cannot qc the series because not all images have been qc-ed");
        // This should not happen, unless a series has too many images and cannot be retrieved all at once. 
        return 
    } else {
        qc.series_fields_errored = template_mismatch + not_set + image_tag_mismatch;
        //qc.template_id = images[0].qc.template_id;
        
        //check for template header count 
        db.TemplateHeader.where({template_id: qc.template_id}).count(function(err, tc) {            
            if (err) console.log(err);

            qc.template_image_count = tc;
            diff = qc.template_image_count - qc.series_image_count; 
            
            if(qc.errored_images > 0) {
                qc.errors.push({
                    type: "image_errors", 
                    msg: "Series contains "+qc.errored_images+" images with qc errors", 
                    c: qc.errored_images,
                    per: qc.errored_images / qc.template_image_count,
                }); 
                
                if(template_mismatch > 0) {
                    qc.errors.push({
                        type: "template_mismatch", 
                        msg: "Series contains "+template_mismatch+" fields with 'template_mismatch' error", 
                        c: template_mismatch,
                        per: template_mismatch / qc.template_field_count,
                    });  
                }
     
                if(not_set > 0) {
                    qc.errors.push({
                        type: "not_set", 
                        msg: "Series contains "+not_set+" fields with 'not_set' error", 
                        c: not_set,
                        per: not_set / qc.template_field_count,
                    }); 
                }

                if(image_tag_mismatch > 0) {
                    qc.errors.push({
                        type: "image_tag_mismatch", 
                        msg: "Series contains "+image_tag_mismatch+" fields with 'image_tag_mismatch' error", 
                        c: image_tag_mismatch,
                        per: image_tag_mismatch / qc.series_field_count,
                    }); 
                }
              
            }
    
            if(warnings > 0) {
                qc.warnings.push({
                    type: "image_warning", 
                    msg: "Series contains "+warnings+" images with QC warnings", 
                    c: warnings,
                    per: warnings / qc.template_image_count,
                });        
            }
                    
            if(diff !== 0) {
                qc.errors.push({
                    type: "image_count_mismatch", 
                    msg: diff > 0 ? "Series is missing "+diff+ " image headers":"Series has "+Math.abs(diff)+ " excess image headers",
                    c: images.length, 
                    tc: qc.template_image_count
                });
            }
    
            series.qc1_state = (qc.errors.length > 0 ? "fail" : "autopass");
            series.qc = qc;
            events.series(series);
            db.Series.update({_id: series._id}, {qc: qc, qc1_state: series.qc1_state}, function(err) {
                if (err) {
                    console.log(err);
                    return cb(err);
                }
                update_exam(series,template.exam_id,cb); 

            });  
        })      
    }
}


function update_exam(series,t_exam_id,cb) {
   
    var exam = {};
    var template_series = [];
    var exam_series = [];

    var series_failed = 0;
    var series_passed = 0;
    var qced_series = 0;
    var image_count = 0;
    var images_errored = 0;
    var images_clean = 0;
    var images_no_template = 0;
    var fields_errored = 0;

    async.series([        

        function(next) {

            db.Exam.findById(series.exam_id, function(err,s_exam) {
                if (err) return next(err);
                if (s_exam.qc) {
                    console.log("qc object already exists");
                    exam = s_exam;
                    next()
                } else {
                    // create qc object for exam 
                    console.log("creating qc object")
                    var qc = {
                        qced_series:0,
                        all_series: 0,
                        template_series: 0, 
                        series_passed: 0,
                        series_failed: 0,
                        series_missing: [],
                        series_no_template: [],
                        image_count:0,
                        images_errored: 0,
                        images_clean:0,
                        images_no_template:0,
                        fields_errored:0                
                    }
                    db.Exam.findOneAndUpdate({_id: s_exam._id},{qc:qc},{upsert:false,'new': true}, function(err,ns_exam){
                        if (err) return next(err);
                        exam = ns_exam;
                        next()
                    })
                }                                 
            });
        },


        function(next){     
            // if there is no template for this series description, then add it to the series_no_template array       
            if (series.qc1_state == 'no template' && t_exam_id == null) {
                //console.log('setting no_template for subject '+ exam.subject + ' and series description '+series.series_desc)
                if (exam.qc.series_no_template.indexOf(series.series_desc) == -1) {
                    exam.qc.series_no_template.push(series.series_desc);
                }
                    
                // count series (for this exam)
                db.Series.find({'exam_id': exam._id}).count(function(err,ns) {                    
                    if(err) return next(err); 
                    exam.qc.all_series = ns;
                    next();
                });
                                 
            } else {return next();}
        },
            
        function(next) { 
            if (series.qc1_state == 'no template' && t_exam_id == null) return next();     
            
            db.Template.find().lean()
            .where('exam_id',t_exam_id)
            .select({'_id': 1, 'series_desc': 1})
            .exec(function(err, _template) {
                if(err) return next(err); 

                exam.qc.template_series = _template.length;

                // create array with all template series descriptions (for this template exam)                
                _template.forEach(function(t){
                    if (template_series.indexOf(t.series_desc) == -1) 
                        template_series.push(t.series_desc);
                });

                // check if the current series description is in the series_no_template array
                var notemp_indx = exam.qc.series_no_template.indexOf(series.series_desc);
                if ( notemp_indx != -1) {
                    exam.qc.series_no_template.splice(notemp_indx,1);
                }

                next();
            })
        },

        function(next) { 

            if (series.qc1_state == 'no template' && t_exam_id == null) return next(); 

            // create array with all qc-ed series (for this exam)
            db.Series.find({'exam_id': exam._id}).lean()
            //.select({'_id': 1, 'series_desc': 1, })
            .exec(function(err, _series) {                    
                if(err) return next(err); 

                exam.qc.all_series = _series.length;
                                
                _series.forEach(function(s){
                    if (exam_series.indexOf(s.series_desc) == -1) {
                        exam_series.push(s.series_desc);
                    }
                    if (typeof s.qc === 'object' && s.qc !== null) {
                        if (series.qc1_state == "fail") {
                            series_failed++;
                        }
                        if (series.qc1_state == "autopass") {
                            series_passed++;
                        }
                                        
                        qced_series++; 

                        // count images
                        image_count += series.qc.series_image_count;
                        images_errored += series.qc.errored_images;
                        images_clean += series.qc.clean;
                        images_no_template += series.qc.notemps;

                        fields_errored += series.qc.series_fields_errored;

                    }
                });

                //console.log(exam_series);

                // check if any template series are missing in this exam
                var series_missing = [];
                template_series.forEach(function(t){
                    if (exam_series.indexOf(t) == -1){
                        series_missing.push(t);
                    }
                })
                exam.qc.series_missing = series_missing;
                
                next(); 

            });                      
        },
        
        function(next){
            //console.log(exam.qc);
            
            if (series.qc1_state != 'no template' && t_exam_id != null) {
                exam.qc.series_failed = series_failed;
                exam.qc.series_passed = series_passed;
                exam.qc.qced_series = qced_series;
                exam.qc.image_count = image_count;
                exam.qc.images_errored = images_errored;
                exam.qc.images_clean = images_clean;
                exam.qc.images_no_template = images_no_template;
                exam.qc.fields_errored = fields_errored;
            }

            db.Exam.findOneAndUpdate({_id: exam._id},{qc:exam.qc},function(err) {
                if (err) return next(err);
                return next();
            })  
        }

    ], function(err) {
        if(err) {
            console.log(err);
            cb(err);
        } 
        cb();
    });
}


//ECMA6 Polyfill for endsWith
if (!String.prototype.endsWith) {
  String.prototype.endsWith = function(searchString, position) {
      var subjectString = this.toString();
      if (typeof position !== 'number' || !isFinite(position) || Math.floor(position) !== position || position > subjectString.length) {
        position = subjectString.length;
      }
      position -= searchString.length;
      var lastIndex = subjectString.indexOf(searchString, position);
      return lastIndex !== -1 && lastIndex === position;
  };
}

exports.isExcluded = function(modality, series_desc) {
    switch(modality) {
    case "MR":
        if(series_desc == "MoCoSeries") return true;
        if(series_desc == "<MPR Collection>") return true;
        if(series_desc == "Perfusion_Weighted") return true;
        if(series_desc.endsWith("_ADC")) return true;
        if(series_desc.endsWith("_TRACEW")) return true;
        if(series_desc.endsWith("_FA")) return true;
        if(series_desc.endsWith("_SBRef")) return true;
        break;

    case "CT":
    case "PT":
    default:
    }
    return false;
}


function reset_and_deprecate(series_id,cb) {
    console.log("deprecating series "+series_id)
    // Un-qc the series
    db.Series.findOneAndUpdate({
        _id: series_id,
    }, {$unset:{qc:1},qc1_state:"re-qcing" }, {'new': true}, 
    function(err, series) {   
        if(err) return cb(err);
        // deprecate all images in that series
        db.Image.deleteMany({
            series_id: series._id,
        }, function(err) {
            if(err) return cb(err);
            return cb();
        })
    })
}

exports.qc_series = qc_series;
exports.update_exam = update_exam;
exports.reset_and_deprecate = reset_and_deprecate;